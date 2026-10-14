'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/firebase-config.js'), 'utf8');
test('staff uses separate CRM Google app, nonpersistent Auth and header-only fresh ID token; public calls never attach staff authority', async () => {
    const calls = [], events = [];
    const staffAuth = {
        currentUser: { getIdToken: async () => { events.push('id-token'); return 'synthetic-crm-id-token'; } },
        setPersistence: async (mode) => { events.push('persistence:' + mode); },
        signInWithPopup: async (provider) => { assert.equal(provider.kind, 'google'); events.push('google-popup'); },
        signOut: async () => { staffAuth.currentUser = null; }
    };
    const auth = () => ({ canvasUser: true });
    auth.Auth = { Persistence: { NONE: 'none' } };
    auth.GoogleAuthProvider = class { kind = 'google'; };
    const appCheck = () => ({ activate() {}, getToken: async () => ({ token: 'synthetic-app-check' }) });
    appCheck.ReCaptchaEnterpriseProvider = class {};
    const firebase = { apps: [], SDK_VERSION: '10.12.2', auth, appCheck, firestore: () => ({}), functions: () => ({}),
        initializeApp: (config, name = '[DEFAULT]') => {
            events.push({ projectId: config.projectId, name });
            const app = { name, auth: () => staffAuth }; firebase.apps.push(app); return app;
        } };
    const context = { firebase, location: { hostname: 'canvas-advertising.com' }, document: { querySelector: () => null },
        console: { log() {}, warn() {}, error() {} }, window: null,
        fetch: async (url, init) => { calls.push({ url, init }); return { ok: true, status: 200, json: async () => ({ ok: true, result: {} }) }; } };
    context.window = context; vm.runInNewContext(source, context);
    await assert.rejects(context.CanvasFirebase.commerce('staff-contact-lookup', { by: 'id', value: 'one' }), /staff_token_required/);
    assert.equal(calls.length, 0);
    await context.CanvasFirebase.commerceStaffSignIn({ projectId: 'crm-test', apiKey: 'public-sdk-only', authDomain: 'crm-test.firebaseapp.com', appId: 'test' });
    assert.ok(events.some((e) => e.projectId === 'crm-test' && e.name === 'canvasCommerceStaff'));
    assert.ok(events.indexOf('persistence:none') < events.indexOf('google-popup'));
    await context.CanvasFirebase.commerce('staff-contact-lookup', { by: 'id', value: 'one' });
    assert.equal(calls[0].url, '/api/commerce');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer synthetic-crm-id-token');
    assert.equal(calls[0].init.headers['X-Firebase-AppCheck'], 'synthetic-app-check');
    assert.ok(!calls[0].init.body.includes('synthetic-crm-id-token'));
    await context.CanvasFirebase.commerce('catalog', {});
    assert.equal(calls[1].init.headers.Authorization, undefined);
    await context.CanvasFirebase.commerceStaffSignOut();
    await assert.rejects(context.CanvasFirebase.commerce('staff-draft', { quoteId: 'one' }), /staff_token_required/);
});
