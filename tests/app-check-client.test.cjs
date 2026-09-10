'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', 'js', 'firebase-config.js'), 'utf8');

function clientFixture(options = {}) {
    const events = [];
    const scripts = [];
    const firebase = {
        SDK_VERSION: '9.22.0',
        apps: [],
        initializeApp() {
            this.apps.push({});
            events.push('initialize-app');
        },
        firestore() { return {}; }
    };
    const document = {
        querySelector(selector) {
            const sourceMatch = selector.match(/script\[src="(.+)"\]/);
            return sourceMatch ? scripts.find((script) => script.src === sourceMatch[1]) || null : null;
        },
        createElement() {
            const listeners = {};
            return {
                dataset: {},
                addEventListener(name, callback) { listeners[name] = callback; },
                dispatch(name) { listeners[name]?.(); }
            };
        },
        head: {
            appendChild(script) {
                scripts.push(script);
                const component = script.src.match(/firebase-(.+)-compat\.js$/)?.[1];
                events.push(`load-${component}`);
                if (component === 'app-check') {
                    const appCheckInstance = {
                        activate() { events.push('activate-app-check'); },
                        async getToken() {
                            events.push('get-token');
                            if (options.tokenError) throw new Error('token unavailable');
                            return { token: 'synthetic-valid-token' };
                        }
                    };
                    firebase.appCheck = () => appCheckInstance;
                    firebase.appCheck.ReCaptchaEnterpriseProvider = class {};
                }
                if (component === 'functions') {
                    firebase.functions = () => ({
                        httpsCallable(name) {
                            return async () => {
                                events.push(`call-${name}`);
                                return { data: { ok: true, id: 'lead-id' } };
                            };
                        }
                    });
                }
                if (component === 'storage') {
                    firebase.storage = () => ({
                        ref: () => ({ child: () => ({ put: async () => events.push('storage-put') }) })
                    });
                }
                queueMicrotask(() => script.dispatch('load'));
            }
        }
    };
    const context = {
        console: { log() {}, warn() {}, error() {} },
        crypto: { randomUUID: () => 'synthetic-submission-id' },
        document,
        firebase,
        Promise,
        queueMicrotask,
        window: null
    };
    context.window = context;
    vm.runInNewContext(source, context, { filename: 'firebase-config.js' });
    return { context, events };
}

test('loads matching App Check before Functions, obtains a token, then submits', async () => {
    const { context, events } = clientFixture();
    await context.CanvasFirebase.submitLead({ name: 'Synthetic', phone: '5125550100', service: 'decals' });
    assert.deepEqual(events, [
        'initialize-app',
        'load-app-check',
        'activate-app-check',
        'load-functions',
        'get-token',
        'call-submitPublicLead'
    ]);
});

test('upload session waits for App Check token and required compat components', async () => {
    const { context, events } = clientFixture();
    const file = { name: 'art.pdf', size: 100, type: 'application/pdf' };
    context.firebase.functions = undefined;
    const promise = context.CanvasFirebase.uploadLeadFiles([file], 'quote');
    await assert.rejects(promise, /invalid response/);
    assert.ok(events.indexOf('get-token') < events.indexOf('call-createLeadUploadSession'));
    assert.ok(events.includes('load-functions'));
    assert.ok(events.includes('load-storage'));
});

test('token acquisition failure prevents an unverified callable request', async () => {
    const second = clientFixture({ tokenError: true });
    await assert.rejects(
        second.context.CanvasFirebase.submitLead({ name: 'Synthetic', phone: '5125550100', service: 'decals' }),
        /token unavailable/
    );
    assert.equal(second.events.some((event) => event === 'call-submitPublicLead'), false);
});
