'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
// Source is public website code; fixture catalog contains no selling prices.
const { JSDOM } = require('jsdom');
const root = path.resolve(__dirname, '..');
for (const locale of ['en', 'es']) test(`preserved ${locale} configurator exposes immutable configuration without authority or mutation`, async () => {
    const html = fs.readFileSync(path.join(root, locale === 'en' ? 'store.html' : 'store-es.html'), 'utf8');
    const dom = new JSDOM(html, { url: 'http://127.0.0.1/store' + (locale === 'es' ? '-es' : ''), runScripts: 'outside-only' });
    try {
        const w = dom.window;
        w.HTMLElement.prototype.scrollIntoView = () => {};
        w.structuredClone = structuredClone;
        const calls = [];
        w.CanvasFirebase = { commerce: async (op) => {
            calls.push(op);
            if (op === 'website-session') return { staffDraftsAvailable: false };
            if (op === 'catalog') return {
                version: 'isolated-unpriced-source-fixture',
                products: [{ productId: 'fixture-banner', name: { en: 'Fixture banner', es: 'Lona de prueba' },
                    mode: 'area', availability: 'available', capacityApproved: true,
                    minimumQuantity: 1, maximumQuantity: 100, options: {}, garmentStock: [] }],
                deliveryRules: [{ methodId: 'manual-review', zone: 'staff-review', kind: 'pickup' }]
            };
            throw Error('No mutations or other API operations allowed in this fixture');
        } };
        const app = w.document.getElementById('commerce-app'), events = [];
        app.addEventListener('canvas:configuration-changed', e => events.push(e.detail));
        const source = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
        w.eval(source.slice(source.indexOf('window.initCanvasCommerce =')));
        await w.initCanvasCommerce();
        const bridge = app.canvasConfigurationSource;
        assert.equal(bridge.version, 'canvas-commerce-configuration-source.v1');
        assert.deepEqual(Object.keys(bridge).sort(), ['snapshot', 'version']);
        assert.equal(bridge.snapshot().authority, 'browser_editable_configuration_only');
        assert.equal(bridge.snapshot().items.length, 0);
        assert.equal(bridge.snapshot().status, 'configuration_only');
        assert.equal(events.length, 1);
        const form = w.document.getElementById('commerce-config');
        form.elements.quantity.value = '2';
        form.elements.designBrief.value = 'Synthetic brief 🎨';
        form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
        const snapshot = bridge.snapshot(), item = snapshot.items[0];
        assert.equal(snapshot.items.length, 1);
        assert.equal(snapshot.catalogVersion, 'isolated-unpriced-source-fixture');
        assert.equal(item.configuration.quantity, 2);
        assert.equal(item.configuration.designBrief, 'Synthetic brief 🎨');
        assert.equal(events.length, 2);
        assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.items) && Object.isFrozen(item.configuration));
        assert.throws(() => { item.configuration.quantity = 999; }, TypeError);
        assert.equal(bridge.snapshot().items[0].configuration.quantity, 2);
        assert.deepEqual(calls, ['website-session', 'catalog']);
        assert.equal(Object.hasOwn(snapshot, 'buyerContactId'), false);
        assert.equal(Object.hasOwn(snapshot, 'totalMinor'), false);
        assert.equal(Object.hasOwn(snapshot, 'token'), false);
        // Original cart edit/duplicate/remove and recovery controls remain present.
        assert.equal(w.document.querySelectorAll('#commerce-cart article').length, 1);
        const originalId = item.lineItemId;
        const action = (en, es) => [...w.document.querySelectorAll('#commerce-cart button')]
            .find(button => button.textContent === (locale === 'es' ? es : en));
        action('Duplicate as a separate item', 'Duplicar como artículo independiente').click();
        await Promise.resolve();
        assert.equal(bridge.snapshot().items.length, 2);
        assert.equal(bridge.snapshot().items[0].lineItemId, originalId);
        assert.notEqual(bridge.snapshot().items[1].lineItemId, originalId);
        action('Edit configuration', 'Editar configuración').click();
        await Promise.resolve();
        form.elements.quantity.value = '3';
        form.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
        assert.equal(bridge.snapshot().items.length, 2);
        assert.equal(bridge.snapshot().items[0].lineItemId, originalId);
        assert.equal(bridge.snapshot().items[0].configuration.quantity, 3);
        action('Remove', 'Quitar').click();
        await Promise.resolve();
        assert.equal(bridge.snapshot().items.length, 1);
        assert.notEqual(bridge.snapshot().items[0].lineItemId, originalId);
        assert.deepEqual(calls, ['website-session', 'catalog']);
        assert.ok(w.document.getElementById('commerce-recovery'));
        assert.ok(w.document.querySelector('.c-reference input[type=file]'));
        w.dispatchEvent(new w.PageTransitionEvent('pagehide', { persisted: true }));
        w.dispatchEvent(new w.PageTransitionEvent('pageshow', { persisted: true }));
        assert.equal(app.canvasConfigurationSource, bridge);
        assert.equal(bridge.snapshot().items.length, 1);
        w.dispatchEvent(new w.PageTransitionEvent('pagehide', { persisted: false }));
        assert.equal(Object.hasOwn(app, 'canvasConfigurationSource'), false);
    } finally { dom.window.close(); }
});

for (const fault of [null, 'configuration', 'dimensions', 'options', 'variant']) test(`restored cart ${fault || 'known configuration'} uses explicit projection`, async () => {
    const dom = new JSDOM(fs.readFileSync(path.join(root, 'store.html'), 'utf8'), { url: 'http://127.0.0.1/store', runScripts: 'outside-only' });
    try {
        const w = dom.window; w.structuredClone = structuredClone;
        const configuration = { quantity: 1, options: {}, variants: [], artworkMode: 'later', designBrief: '', notes: '', dimensions: { width: 3, height: 4, unit: 'ft' } };
        if (fault === 'configuration') configuration.serverTotalMinor = 999;
        if (fault === 'dimensions') configuration.dimensions.accessToken = 'SYNTHETIC-PRIVATE-SENTINEL';
        if (fault === 'options') configuration.options.customerRecord = { name: 'SYNTHETIC-PRIVATE-SENTINEL' };
        if (fault === 'variant') configuration.variants = [{ sku: 'x', color: 'x', size: 'x', quantity: 1, credential: 'SYNTHETIC-PRIVATE-SENTINEL' }];
        const raw = JSON.stringify([{ lineItemId: 'preserved-id', productId: 'fixture-banner', configuration }]);
        w.localStorage.setItem('canvas_commerce_cart_v1', raw);
        w.CanvasFirebase = { commerce: async (op) => {
            if (op === 'website-session') return { staffDraftsAvailable: false };
            if (op === 'catalog') return { version: 'fixture', products: [{ productId: 'fixture-banner', name: { en: 'Fixture', es: 'Prueba' }, mode: 'area', availability: 'available', capacityApproved: true, minimumQuantity: 1, maximumQuantity: 100, options: {}, garmentStock: [] }], deliveryRules: [{ methodId: 'manual', zone: 'review', kind: 'pickup' }] };
            throw Error('No mutations allowed');
        } };
        const source = fs.readFileSync(path.join(root, 'js/main.js'), 'utf8');
        w.eval(source.slice(source.indexOf('window.initCanvasCommerce =')));
        await w.initCanvasCommerce();
        const snapshot = w.document.getElementById('commerce-app').canvasConfigurationSource.snapshot();
        assert.equal(snapshot.status, fault ? 'review_required' : 'configuration_only');
        assert.equal(snapshot.reason, fault ? 'unsupported_or_unavailable_configuration' : null);
        assert.equal(snapshot.items.length, fault ? 0 : 1);
        if (!fault) {
            assert.equal(snapshot.items[0].lineItemId, 'preserved-id');
            assert.deepEqual(JSON.parse(JSON.stringify(snapshot.items[0].configuration)), configuration);
        }
        assert.equal(JSON.stringify(snapshot).includes('SYNTHETIC-PRIVATE-SENTINEL'), false);
        assert.equal(JSON.stringify(snapshot).includes('serverTotalMinor'), false);
        assert.equal(w.localStorage.getItem('canvas_commerce_cart_v1'), raw, 'Do not repair, erase or rewrite retained cart');
    } finally { dom.window.close(); }
});
