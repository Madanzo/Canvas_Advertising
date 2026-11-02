'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/canvas-staff-mapping');
const fixture = () => ({
    source: { version: 'canvas-commerce-configuration-source.v1', authority: 'browser_editable_configuration_only', catalogVersion: 'isolated-owner-catalog', status: 'configuration_only', reason: null,
        items: [{ lineItemId: 'item-1', productId: 'explicit-mesh', configuration: { quantity: 2, options: { package: 'installed' }, variants: [], artworkMode: 'later', designBrief: 'Brief 🎨', notes: '  literal notes  ', dimensions: { width: 8, height: 4, unit: 'ft' } } }] },
    mapping: { version: M.version, catalogVersion: 'isolated-owner-catalog', profiles: [{ sourceProductId: 'explicit-mesh', sourceOptions: { package: 'installed' }, product: 'mesh', option: 'package' }] },
    assignments: [{ lineItemId: 'item-1', jobId: 'job-1', designId: 'design-1', placementId: 'front', installHeightFeet: null, specialInstallation: false, specialGrommets: false }]
});
const run = f => M.map(f.source, f.mapping, f.assignments);
test('explicit mapping retains identities, exact units, notes and separate unpreserved artwork plan', () => {
    const f = fixture(), before = JSON.stringify(f), r = run(f);
    assert.equal(r.status, 'prepared_configuration_only');
    assert.deepEqual(r.rows[0], { id: 'item-1', jobId: 'job-1', product: 'mesh', option: 'package', width: '96', height: '48', quantity: 2, design: 'design-1', placement: 'front', notes: '[Design brief]\nBrief 🎨\n[Notes]\n  literal notes  ', installHeight: null, specialInstallation: false, specialGrommets: false, artwork: null });
    assert.deepEqual(r.artworkActions, [{ itemId: 'item-1', mode: 'later', sourcePreserved: false }]);
    assert.equal(JSON.stringify(f), before); assert.ok(Object.isFrozen(r.rows[0]));
    assert.equal(Object.hasOwn(r, 'totalMinor'), false); assert.equal(Object.hasOwn(r, 'buyerContactId'), false);
});
for (const [unit, value] of [['in', 1], ['ft', 1 / 12], ['cm', 2.54], ['mm', 25.4], ['m', 0.0254]]) test(`exact ${unit} conversion never silently rounds`, () => {
    const f = fixture(); f.source.items[0].configuration.dimensions = { width: value, height: value, unit };
    const r = run(f);
    if (unit === 'ft') assert.equal(r.status, 'review_required');
    else { assert.equal(r.status, 'prepared_configuration_only'); assert.equal(r.rows[0].width, '1'); }
});
for (const fault of ['catalog', 'option', 'ambiguous', 'assignment', 'unknown', 'apparel', 'artwork', 'quantity', 'rounding', 'notes', 'price']) test(`review without partial mapping: ${fault}`, () => {
    const f = fixture(), c = f.source.items[0].configuration;
    if (fault === 'catalog') f.mapping.catalogVersion = 'stale';
    if (fault === 'option') c.options.package = 'unconfirmed';
    if (fault === 'ambiguous') f.mapping.profiles.push(structuredClone(f.mapping.profiles[0]));
    if (fault === 'assignment') f.assignments[0].lineItemId = 'other';
    if (fault === 'unknown') c.dimensions.secret = 'synthetic';
    if (fault === 'apparel') c.variants.push({ sku: 'shirt', quantity: 2 });
    if (fault === 'artwork') c.artworkMode = 'already_approved';
    if (fault === 'quantity') c.quantity = 1.5;
    if (fault === 'rounding') c.dimensions = { width: 1, height: 1, unit: 'cm' };
    if (fault === 'notes') c.notes = 'x'.repeat(2000);
    if (fault === 'price') f.mapping.profiles[0].totalMinor = 0;
    const r = run(f); assert.equal(r.status, 'review_required'); assert.equal(Object.hasOwn(r, 'rows'), false);
});
test('two mesh lines preserve explicit job grouping without pooling or calculating prices', () => {
    const f = fixture(); f.source.items.push(structuredClone(f.source.items[0])); f.source.items[1].lineItemId = 'item-2';
    f.assignments.push({ ...f.assignments[0], lineItemId: 'item-2', designId: 'design-2', placementId: 'back' });
    const r = run(f); assert.equal(r.status, 'prepared_configuration_only'); assert.equal(r.rows.length, 2);
    assert.equal(r.rows[0].jobId, r.rows[1].jobId); assert.notEqual(r.rows[0].design, r.rows[1].design);
});
for (const fault of ['source', 'mapping', 'profile', 'assignment', 'item', 'configuration', 'options', 'dimension', 'quantity-limit']) test(`malformed ${fault} refuses safely`, () => {
    const f = fixture();
    if (fault === 'source') f.source = null;
    if (fault === 'mapping') f.mapping = null;
    if (fault === 'profile') f.mapping.profiles[0] = null;
    if (fault === 'assignment') f.assignments[0] = null;
    if (fault === 'item') f.source.items[0] = null;
    if (fault === 'configuration') f.source.items[0].configuration = null;
    if (fault === 'options') f.source.items[0].configuration.options = null;
    if (fault === 'dimension') f.source.items[0].configuration.dimensions.width = Infinity;
    if (fault === 'quantity-limit') f.source.items[0].configuration.quantity = 100001;
    const r = run(f); assert.equal(r.status, 'review_required'); assert.equal(Object.hasOwn(r, 'rows'), false);
});
test('missing, duplicate or orphaned design assignments cannot silently reassign a line', () => {
    for (const kind of ['missing', 'duplicate', 'orphan']) {
        const f = fixture();
        f.source.items.push({ ...structuredClone(f.source.items[0]), lineItemId: 'item-2' });
        if (kind === 'duplicate') f.assignments.push(structuredClone(f.assignments[0]));
        if (kind === 'orphan') f.assignments.push({ ...f.assignments[0], lineItemId: 'item-3' });
        assert.equal(run(f).status, 'review_required');
    }
});
for (const fault of ['product-array', 'product-object', 'sparse-items', 'lone-surrogate']) test(`reviewer regression ${fault} requires review without throwing or partial rows`, () => {
    const f = fixture();
    if (fault === 'product-array') f.mapping.profiles[0].product = ['mesh'];
    if (fault === 'product-object') f.mapping.profiles[0].product = { toString: 'invalid' };
    if (fault === 'sparse-items') f.source.items = new Array(1);
    if (fault === 'lone-surrogate') f.source.items[0].configuration.notes = '\ud800';
    const r = run(f); assert.equal(r.status, 'review_required'); assert.equal(Object.hasOwn(r, 'rows'), false);
});
