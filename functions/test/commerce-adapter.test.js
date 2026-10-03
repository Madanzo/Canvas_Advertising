'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { WebsiteCommerce, assertSquareCheckoutAllowed, beginSquareCheckout, crmTransport, FirestoreWebsiteStore, hash } = require('../commerce-adapter');
const { WebsiteMemoryStore } = require('../../scripts/commerce/preview-server.cjs');
const enabled = { enabled: true, checkoutMode: 'finix_sandbox', legacySquareDisabled: true, legacyLinksDrained: true };
async function setup() {
    const store = new WebsiteMemoryStore(); const requests = []; const letters = [];
    store.data.set('config', enabled);
    const service = new WebsiteCommerce({ store, config: async () => enabled,
        transport: async (operation, raw, capability) => {
            requests.push({ operation, raw, capability });
            if (operation === 'session') return { ok: true, result: { token: 'server_capability_only' } };
            const body = JSON.parse(raw);
            return { ok: true, version: 'canvas-commerce.v1', result: operation === 'checkout'
                ? { id: body.sourceOrderId } : operation === 'payment' ? { state: 'unknown' } : { id: body.orderId } };
        }, sendRecovery: async (letter) => letters.push(letter) });
    const session = await service.session(null, 'isolated');
    return { service, store, requests, letters, cookie: session.cookie };
}
test('disabled commerce never makes a network call', async () => {
    const state = await setup(); state.service.config = async () => ({});
    await assert.rejects(state.service.call(state.cookie, 'catalog', '{}'), /commerce_disabled/);
    assert.equal(state.requests.length, 0);
});
test('unverified Square cutover and live payment mode remain closed', async () => {
    for (const config of [{ ...enabled, legacyLinksDrained: false }, { ...enabled, legacySquareDisabled: false }, { ...enabled, checkoutMode: 'finix_live' }]) {
        const { service } = await setup(); service.config = async () => config;
        await assert.rejects(service.session(null), /checkout_cutover_pending/);
    }
});
test('Square remains unchanged by default; finix/disabled modes block NEW Square charges', async () => {
    for (const config of [undefined, { checkoutMode: 'square' }]) await assertSquareCheckoutAllowed({ doc: () => ({ get: async () => ({ data: () => config }) }) });
    for (const mode of ['disabled', 'finix_sandbox', 'finix_live']) await assert.rejects(assertSquareCheckoutAllowed({ doc: () => ({ get: async () => ({ data: () => ({ checkoutMode: mode }) }) }) }), /legacy_checkout_disabled/);
});
test('atomic Square cutover barrier blocks Finix during in-flight or interrupted legacy calls', async () => {
    const memory = new WebsiteMemoryStore();
    const db = { doc: (key) => key, runTransaction: (callback) => memory.transaction(async (tx) => callback({
        get: async (key) => { const data = await tx.get(key); return { exists: Boolean(data), data: () => data }; },
        set: (key, data) => tx.set(key, data)
    })) };
    const key = 'canvas_commerce_private/config';
    const finish = await beginSquareCheckout(db);
    assert.equal(memory.data.get(key).activeSquareCalls, 1);
    memory.data.set(key, { ...memory.data.get(key), ...enabled });
    const service = new WebsiteCommerce({ store: memory, config: async () => memory.data.get(key), transport: () => assert.fail('no network') });
    await assert.rejects(service.gate(), /cutover_pending/);
    await assert.rejects(beginSquareCheckout(db), /legacy_checkout_disabled/);
    await finish('verified_square_reference');
    await service.gate();
    memory.data.set(key, { ...memory.data.get(key), enabled: false, checkoutMode: 'square' });
    const uncertain = await beginSquareCheckout(db); await uncertain(null);
    memory.data.set(key, { ...memory.data.get(key), ...enabled });
    await assert.rejects(service.gate(), /cutover_pending/);
    assert.equal(memory.data.get(key).activeSquareCalls, 1, 'unknown never times out into Finix acceptance');
});
test('exact serialized checkout is durable before network and stable through interrupted delivery', async () => {
    const state = await setup(); const { service, store, cookie } = state;
    const original = service.transport; let lost = true;
    service.transport = async (op, raw, cap) => {
        if (op === 'checkout') {
            assert.equal([...store.data.values()].find((v) => v.operation === 'checkout').serializedBody, raw);
            if (lost) { lost = false; throw new Error('worker interrupted'); }
        }
        return original(op, raw, cap);
    };
    const raw = '{ "sourceOrderId":"orderA", "contact":{"email":"a@example.com"} }';
    await assert.rejects(service.call(cookie, 'checkout', raw, 'stable'), /interrupted/);
    const resumed = new WebsiteCommerce({ store, config: service.config, transport: original });
    assert.equal((await resumed.call(cookie, 'checkout', null, 'stable')).result.id, 'orderA');
    assert.equal(state.requests.find((r) => r.operation === 'checkout').raw, raw);
    await assert.rejects(resumed.call(cookie, 'checkout', JSON.stringify(JSON.parse(raw)), 'stable'), /idempotency_conflict/);
});
test('ok payment unknown/pending/authorized is NOT cached and retry reuses original token bytes', async () => {
    for (const initial of ['unknown', 'pending', 'authorized']) {
        const state = await setup(); let calls = 0;
        const original = state.service.transport;
        state.service.transport = async (op, raw, cap) => op === 'payment'
            ? (++calls, { ok: true, result: { state: calls === 1 ? initial : 'captured' } }) : original(op, raw, cap);
        const body = ' {"orderId":"A","requestId":"p","token":"TKsynthetic123456"}';
        assert.equal((await state.service.call(state.cookie, 'payment', body, 'p')).result.state, initial);
        assert.equal((await state.service.call(state.cookie, 'payment', null, 'p')).result.state, 'captured');
        assert.equal(calls, 2);
    }
});
test('create-upload retries always refresh expiring capability, preserving manifest', async () => {
    const state = await setup(); let calls = 0; const original = state.service.transport;
    state.service.transport = async (op, raw, cap) => op === 'create-upload'
        ? (++calls, { ok: true, result: { uploadUrl: 'https://isolated/' + calls } }) : original(op, raw, cap);
    const body = '{"orderId":"A","role":"source"}';
    await state.service.call(state.cookie, 'create-upload', body, 'u');
    assert.equal((await state.service.call(state.cookie, 'create-upload', null, 'u')).result.uploadUrl, 'https://isolated/2');
});
test('unresolved Finix payment blocks reverse Square cutover until exact retry reconciles', async () => {
    const state = await setup(); let captured = false;
    const original = state.service.transport;
    state.service.transport = async (op, raw, cap) => op === 'payment'
        ? { ok: true, result: { state: captured ? 'captured' : 'unknown' } } : original(op, raw, cap);
    const raw = '{"orderId":"A","requestId":"payment","token":"TKsynthetic123456"}';
    await state.service.call(state.cookie, 'payment', raw, 'payment');
    assert.equal(state.store.data.get('config').activeFinixCalls, 1);
    const db = { doc: (key) => key, runTransaction: (callback) => state.store.transaction(async (tx) => callback({
        get: async (key) => { const data = await tx.get(key.split('/').pop()); return { exists: Boolean(data), data: () => data }; },
        set: (key, data) => tx.set(key.split('/').pop(), data)
    })) };
    state.store.data.set('config', { ...state.store.data.get('config'), checkoutMode: 'square' });
    await assert.rejects(beginSquareCheckout(db), /legacy_checkout_disabled/);
    state.store.data.set('config', { ...state.store.data.get('config'), checkoutMode: 'finix_sandbox' });
    captured = true;
    await state.service.call(state.cookie, 'payment', null, 'payment');
    assert.equal(state.store.data.get('config').activeFinixCalls, 0);
    await state.service.call(state.cookie, 'payment', null, 'payment');
    assert.equal(state.store.data.get('config').activeFinixCalls, 0, 'settlement is counted once');
});
test('customer markers, staff routes, final uploads, instruments and amounts cannot authorize delivery', async () => {
    const { service, cookie } = await setup();
    for (const operation of ['session', 'release', 'request-proof', 'worker', 'create-final-upload']) await assert.rejects(service.call(cookie, operation, '{}'), /operation_forbidden/);
    for (const key of ['source', 'test', 'customerId', 'suppressNotifications', 'amountMinor', 'instrumentId']) await assert.rejects(service.call(cookie, 'order', JSON.stringify({ [key]: true })), /forbidden_field/);
    await assert.rejects(service.call(cookie, 'create-upload', '{"role":"final"}'), /source_upload_only/);
});
test('concurrent consumption and lost response recovery create one ORDER-SCOPED session', async () => {
    const state = await setup(); const { service, cookie, letters, requests } = state;
    await service.call(cookie, 'checkout', '{"sourceOrderId":"A","contact":{"email":"a@example.com"}}', 'A');
    await service.call(cookie, 'checkout', '{"sourceOrderId":"B","contact":{"email":"b@example.com"}}', 'B');
    await service.requestRecovery('A', 'a@example.com', 'test');
    const results = await Promise.all(Array.from({ length: 5 }, () => service.recover(letters[0].token)));
    assert.equal(new Set(results.map((r) => r.cookie)).size, 1);
    const recovered = results[0].cookie;
    await service.call(recovered, 'order', '{"orderId":"A"}');
    assert.equal(JSON.parse(requests.findLast((r) => r.operation === 'session').raw).orderId, 'A');
    for (const [op, body, attempt] of [['order', '{"orderId":"B"}'], ['order', '{}'], ['catalog', '{}'], ['quote', '{}', 'q'],
        ['reorder', '{"orderId":"A","requestId":"r"}', 'r'], ['checkout', null, 'B']]) {
        await assert.rejects(service.call(recovered, op, body, attempt), /recovery_order_scope/);
    }
    assert.equal((await service.session(recovered)).orderId, 'A');
    await assert.rejects(service.call(recovered, 'order', '{"orderId":"B"}'), /recovery_order_scope/);
});
test('failed recovery transaction rolls back consumption AND session; same proof can retry', async () => {
    const { service, store, cookie, letters } = await setup();
    await service.call(cookie, 'checkout', '{"sourceOrderId":"A","contact":{"email":"a@example.com"}}', 'A');
    await service.requestRecovery('A', 'a@example.com', 'test');
    const before = structuredClone([...store.data]); const tx = store.transaction.bind(store);
    let fail = true;
    store.transaction = (cb) => tx(async (transaction) => { const result = await cb(transaction); if (fail) { fail = false; throw new Error('commit failed'); } return result; });
    await assert.rejects(service.recover(letters[0].token), /commit failed/);
    assert.deepEqual([...store.data], before);
    assert.equal((await service.recover(letters[0].token)).orderId, 'A');
});
test('knowing an email/order never yields a recovery token or sends to a substituted recipient', async () => {
    const { service, cookie, letters } = await setup();
    await service.call(cookie, 'checkout', '{"sourceOrderId":"A","contact":{"email":"a@example.com"}}', 'A');
    assert.deepEqual(await service.requestRecovery('A', 'attacker@example.com', 'test'), { ok: true, result: { requested: true } });
    assert.equal(letters.length, 0);
});
test('transport fixes tenant endpoint, forbids redirect and forwards EXACT request bytes with server credential', async () => {
    let sent;
    const transport = crmTransport({ baseUrl: 'https://crm.example/api/v1/tenants/canvas_advertising/commerce/', credential: 'mk_live_isolated.test',
        fetchImpl: async (url, init) => { sent = { url, init }; return Response.json({ ok: true, version: 'canvas-commerce.v1', result: {} }); } });
    await transport('quote', ' {"version":"canvas-commerce.v1"}', 'server_capability');
    assert.equal(sent.init.body, ' {"version":"canvas-commerce.v1"}'); assert.equal(sent.init.redirect, 'error');
    assert.equal(sent.init.headers.Authorization, 'Bearer server_capability');
    assert.throws(() => crmTransport({ baseUrl: 'https://crm.example/other/', credential: 'x' }), /endpoint/);
});
test('Firestore Website store stages writes until every decision read completes', async () => {
    const calls = [];
    const store = new FirestoreWebsiteStore({ doc: (p) => p, runTransaction: async (callback) => callback({
        get: async (p) => { calls.push(['get', p]); return { exists: false }; }, set: (p, data) => calls.push(['set', p, data])
    }) });
    await store.transaction(async (tx) => { tx.set('session_a', {}); await tx.get('config'); });
    assert.deepEqual(calls.map((c) => c[0]), ['get', 'set']);
    assert.equal(calls[0][1], 'canvas_commerce_private/config');
    assert.equal(hash('same').length, 64);
});
