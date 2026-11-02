'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const A = require('../js/canvas-staff-assignments');
const M = require('../js/canvas-staff-mapping');
const source = () => ({ version: 'canvas-commerce-configuration-source.v1', authority: 'browser_editable_configuration_only', catalogVersion: 'fixture', status: 'configuration_only', reason: null,
    items: [{ lineItemId: 'item-1', productId: 'mesh-fixture', configuration: { quantity: 1, options: {}, variants: [], artworkMode: 'later', designBrief: '', notes: '', dimensions: { width: 4, height: 8, unit: 'ft' } } }] });
const mapping = { version: M.version, catalogVersion: 'fixture', profiles: [{ sourceProductId: 'mesh-fixture', sourceOptions: {}, product: 'mesh', option: 'package' }] };
for (const language of ['en', 'es']) test(`${language} explicit assignments retain IDs, refuse stale configuration and do not inherit duplicate designs`, () => {
    const dom = new JSDOM('<main><div id="off"></div><div id="on"></div></main>');
    try {
        const doc = dom.window.document; let reads = 0, current = source();
        const off = A.mount(doc.getElementById('off'), { language, mapping, readConfiguration: () => { reads++; return current; } });
        off.refresh(); off.read(); assert.equal(reads, 0); assert.equal(doc.querySelector('#off button').disabled, true);
        const panel = A.mount(doc.getElementById('on'), { enabled: true, language, mapping, readConfiguration: () => current });
        panel.refresh();
        assert.equal(panel.read().status, 'review_required');
        for (const [key, value] of [['jobId', 'one-job'], ['designId', 'design-1'], ['placementId', 'front']]) doc.querySelector(`#on [data-assignment=${key}]`).value = value;
        const prepared = panel.read(); assert.equal(prepared.status, 'prepared_configuration_only');
        assert.equal(prepared.rows[0].id, 'item-1'); assert.equal(prepared.rows[0].installHeight, null);
        current.items[0].configuration.quantity = 2;
        assert.equal(panel.read().status, 'review_required');
        current.items.push({ ...structuredClone(current.items[0]), lineItemId: 'item-2' });
        panel.refresh();
        assert.equal(doc.querySelector('[data-canvas-item="item-1"] [data-assignment=designId]').value, 'design-1');
        assert.equal(doc.querySelector('[data-canvas-item="item-2"] [data-assignment=designId]').value, '');
        assert.equal(panel.read().status, 'review_required');
        for (const [key, value] of [['jobId', 'one-job'], ['designId', 'design-2'], ['placementId', 'back']]) doc.querySelector(`[data-canvas-item="item-2"] [data-assignment=${key}]`).value = value;
        assert.equal(panel.read().rows.length, 2);
        current.items = new Array(1); panel.refresh(); assert.equal(panel.read().status, 'review_required');
        assert.equal(doc.querySelectorAll('#on fieldset').length, 2, 'Failed refresh keeps local entries; no silent repair');
        panel.dispose(); assert.equal(doc.querySelector('#on').children.length, 0);
    } finally { dom.window.close(); }
});
