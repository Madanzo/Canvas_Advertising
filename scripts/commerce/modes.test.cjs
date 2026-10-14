'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadBackend } = require('./load-backend.cjs');
const { WebsiteMemoryStore } = require('./preview-server.cjs');
const { WebsiteCommerce } = require('../../functions/commerce-adapter');
test('explicit isolated 50% policy keeps unpaid, deposit, artwork and balance distinct with exact payment retries',
    { skip: !process.env.CRM_TEST_ROOT }, async () => {
    const backend = await loadBackend();
    const catalogRecord = backend.store.data.get('tenants/canvas_test/commerceConfig/catalog');
    catalogRecord.paymentPolicy = { mode: 'deposit', depositBasisPoints: 5000 };
    catalogRecord.version = 'isolated-deposit-v1'; // TEST ONLY; no deployed policy changed.
    const store = new WebsiteMemoryStore();
    store.data.set('config', { enabled: true, checkoutMode: 'finix_sandbox', legacySquareDisabled: true, legacyLinksDrained: true });
    const service = new WebsiteCommerce({ store, transport: backend.request, config: async () => store.data.get('config') });
    const { cookie } = await service.session(null, 'deposit');
    const call = async (op, body, id) => {
        const response = await service.call(cookie, op, body == null ? null : JSON.stringify(body), id);
        assert.equal(response.ok, true, JSON.stringify(response)); return response.result;
    };
    const catalog = await call('catalog', {});
    const quote = await call('quote', { version: 'canvas-commerce.v1', requestId: 'deposit_quote', catalogVersion: catalog.version, locale: 'en',
        delivery: { methodId: 'pickup', destinationZone: 'shop' }, items: [{ lineItemId: 'deposit_item', productId: 'banner',
            configuration: { dimensions: { width: 3, height: 4, unit: 'ft' }, quantity: 1, options: { material: 'vinyl', finish: 'hem' },
                variants: [], artworkMode: 'later', designBrief: '', notes: '' } }] }, 'deposit_quote');
    const order = await call('checkout', { version: 'canvas-commerce.v1', quoteId: quote.quoteId, acceptedHash: quote.quoteHash,
        termsVersion: quote.termsVersion, sourceOrderId: 'deposit_order', contact: { name: 'Synthetic Deposit', email: 'deposit@example.com', phone: '5125550106' } }, 'deposit_order');
    let workspace = await call('order', { orderId: order.id });
    assert.equal(workspace.financial, 'unpaid');
    assert.equal(workspace.requiredMinor, Math.ceil(quote.totalMinor / 2));
    assert.ok(workspace.items.every(i => i.readiness === 'financial_hold'));
    await call('payment', { orderId: order.id, requestId: 'deposit_payment', token: 'TKisolatedDeposit123456', collection: 'required' }, 'deposit_payment');
    await call('payment', null, 'deposit_payment');
    workspace = await call('order', { orderId: order.id });
    assert.equal(workspace.capturedMinor, Math.ceil(quote.totalMinor / 2));
    assert.equal(workspace.balanceMinor, quote.totalMinor - workspace.capturedMinor);
    assert.ok(workspace.items.every(i => i.readiness === 'needs_artwork'), 'deposit is not artwork approval or production release');
    assert.equal(backend.controls.submits, 1);
    await call('payment', { orderId: order.id, requestId: 'balance_payment', token: 'TKisolatedBalance123456', collection: 'balance' }, 'balance_payment');
    await call('payment', null, 'balance_payment');
    workspace = await call('order', { orderId: order.id });
    assert.equal(workspace.capturedMinor, quote.totalMinor); assert.equal(workspace.balanceMinor, 0);
    assert.equal(backend.controls.submits, 2, 'one deposit and one explicit balance, not duplicate retries');
    assert.ok(workspace.items.every(i => i.readiness === 'needs_artwork'));
});
test('mixed synthetic banner/mesh/decal/rigid/transfer/apparel quotes preserve pack/variant quantities and server authority',
    { skip: !process.env.CRM_TEST_ROOT }, async () => {
    const backend = await loadBackend();
    const store = new WebsiteMemoryStore();
    store.data.set('config', { enabled: true, checkoutMode: 'finix_sandbox', legacySquareDisabled: true, legacyLinksDrained: true });
    const service = new WebsiteCommerce({ store, transport: backend.request, config: async () => store.data.get('config') });
    const { cookie } = await service.session(null, 'modes');
    const invoke = (op, body, id) => service.call(cookie, op, JSON.stringify(body), id);
    const catalog = (await invoke('catalog', {})).result;
    assert.equal(catalog.products.length, 6);
    const items = catalog.products.map((p) => ({ lineItemId: p.productId + '_item', productId: p.productId,
        configuration: { dimensions: { width: 3, height: 4, unit: 'ft' },
            quantity: p.mode === 'garment_matrix' ? 8 : 2, options: { material: 'vinyl', finish: 'hem' },
            variants: p.garmentStock.map((v) => ({ sku: v.sku, color: v.color, size: v.size, quantity: 1, personalization: 'Synthetic' })),
            artworkMode: 'later', designBrief: '', notes: '' } }));
    const input = { version: 'canvas-commerce.v1', requestId: 'mixed_modes', catalogVersion: catalog.version, locale: 'es',
        delivery: { methodId: 'pickup', destinationZone: 'shop' }, items };
    const response = await invoke('quote', input, 'mixed_modes');
    assert.equal(response.ok, true, JSON.stringify(response));
    const quote = response.result;
    assert.equal(quote.items.find((i) => i.productId === 'transfer').pieces, 10);
    assert.equal(quote.items.find((i) => i.productId === 'apparel').pieces, 8);
    assert.ok(quote.items.every((i) => i.price.baseMinor > 0 && i.taxMinor >= 0));
    const order = await invoke('checkout', { version: 'canvas-commerce.v1', quoteId: quote.quoteId, acceptedHash: quote.quoteHash,
        termsVersion: quote.termsVersion, sourceOrderId: 'mixed_order', contact: { name: 'Synthetic Modes', email: 'modes@example.com' } }, 'mixed_order');
    assert.equal(order.ok, true, JSON.stringify(order));
    assert.equal(order.result.totalMinor, quote.totalMinor);
    assert.equal(order.result.stockReservations.reduce((sum, row) => sum + row.quantity, 0), 8);
    const wrongQuantity = structuredClone(input); wrongQuantity.requestId = 'bad_matrix'; wrongQuantity.items[5].configuration.quantity = 7;
    assert.equal((await invoke('quote', wrongQuantity, 'bad_matrix')).ok, false);
    assert.equal((await invoke('quote', { ...input, requestId: 'browser_total', totalMinor: 1 }, 'browser_total')).code, 'invalid_request');
    const badOption = structuredClone(input); badOption.requestId = 'bad_finish'; badOption.items[0].configuration.options.finish = 'visitor_invented';
    assert.equal((await invoke('quote', badOption, 'bad_finish')).ok, false);
    const newQuote = await invoke('reorder', { orderId: order.result.id, requestId: 'reorder_current' }, 'reorder_current');
    assert.equal(newQuote.ok, true, JSON.stringify(newQuote));
    assert.notEqual(newQuote.result.quoteId, quote.quoteId);
    assert.equal(newQuote.result.items.length, 6);
    // Line IDs are scoped by the NEW quote/order; preserving line labels must
    // not preserve prior mutable asset/proof references.
    assert.equal(new Set(newQuote.result.items.map((i) => i.lineItemId)).size, 6);
    const reordered = await invoke('checkout', { version: 'canvas-commerce.v1', quoteId: newQuote.result.quoteId,
        acceptedHash: newQuote.result.quoteHash, termsVersion: newQuote.result.termsVersion, sourceOrderId: 'reordered_order',
        contact: { name: 'Synthetic Reorder', email: 'reorder@example.com' } }, 'reordered_order');
    assert.equal(reordered.ok, true, JSON.stringify(reordered));
    assert.notEqual(reordered.result.id, order.result.id);
    const workspace = await invoke('order', { orderId: reordered.result.id });
    assert.ok(workspace.result.items.every((item) => item.assets.length === 0 && item.proof === null));
});
