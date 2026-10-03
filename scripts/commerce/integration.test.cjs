'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { startPreview, prepareProofs } = require('./preview-server.cjs');
test('actual website HTTP → adapter → CRM POST: multi-item, design/placement allocations, lost capture, delayed uploads and revised proofs',
    { skip: !process.env.CRM_TEST_ROOT }, async (t) => {
    const preview = await startPreview({ port: 3211 });
    t.after(() => new Promise((resolve) => preview.server.close(resolve)));
    const { origin, service, backend, mailbox } = preview;
    let cookie;
    const httpCall = async (operation, body, attemptId, chosenCookie = cookie) => {
        const response = await fetch(origin + '/api/commerce', { method: 'POST', headers: {
            'Content-Type': 'application/json', Origin: origin, ...(chosenCookie ? { Cookie: chosenCookie } : {})
        }, body: JSON.stringify(['website-session', 'request-recovery', 'recover'].includes(operation) ? { operation, ...body }
            : { operation, serializedBody: typeof body === 'string' ? body : body == null ? null : JSON.stringify(body), attemptId }) });
        if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
        return response.json();
    };
    const invoke = async (...args) => { const response = await httpCall(...args); assert.equal(response.ok, true, JSON.stringify(response)); return response.result; };
    await invoke('website-session', {});
    const primaryCookie = cookie;
    const config = backend.store.data.get('tenants/canvas_test/commerceConfig/catalog');
    config.products[0].requiredPlacements = ['front', 'back'];
    const catalog = await invoke('catalog', {});
    const request = { version: 'canvas-commerce.v1', requestId: 'multi_quote', catalogVersion: catalog.version, locale: 'en',
        delivery: { methodId: 'pickup', destinationZone: 'shop' }, items: [2, 1].map((quantity, i) => ({ lineItemId: 'item' + i, productId: 'banner',
            configuration: { dimensions: { width: 3, height: 4, unit: 'ft' }, quantity, options: { material: 'vinyl', finish: 'hem' },
                variants: [], artworkMode: 'later', designBrief: '', notes: '' } })) };
    const quote = await invoke('quote', request, 'multi_quote');
    assert.equal(quote.items.length, 2); assert.equal(quote.totalMinor, 8119);
    const checkout = JSON.stringify({ version: 'canvas-commerce.v1', quoteId: quote.quoteId, acceptedHash: quote.quoteHash,
        termsVersion: quote.termsVersion, sourceOrderId: 'single_order', contact: { name: 'Synthetic Canvas', email: 'canvas@example.com', phone: '5125550106' } });
    const originalTransport = service.transport; let loseCheckout = true;
    service.transport = async (operation, raw, token) => {
        const result = await originalTransport(operation, raw, token);
        if (operation === 'checkout' && loseCheckout) { loseCheckout = false; throw new Error('lost committed response'); }
        return result;
    };
    assert.equal((await httpCall('checkout', checkout, 'single_order')).code, 'delivery_uncertain');
    const order = await invoke('checkout', null, 'single_order');
    assert.equal((await invoke('checkout', checkout, 'single_order')).id, order.id);
    const conflict = JSON.stringify({ ...JSON.parse(checkout), contact: { name: 'Changed', email: 'canvas@example.com' } });
    assert.equal((await httpCall('checkout', conflict, 'single_order')).code, 'idempotency_conflict');
    assert.equal([...backend.store.data.keys()].filter((k) => k.includes('/commerceOrders/')).length, 1);
    const payment = JSON.stringify({ orderId: order.id, requestId: 'one_payment', token: 'TKisolatedPaymentToken1234', collection: 'required' });
    backend.controls.losePaymentResponse = true;
    assert.equal((await invoke('payment', payment, 'one_payment')).state, 'unknown');
    assert.equal((await invoke('payment', null, 'one_payment')).state, 'captured');
    assert.equal(backend.controls.submits, 1);
    assert.equal([...backend.store.data.keys()].filter((k) => k.includes('/payments/')).length, 1);
    let current = await invoke('order', { orderId: order.id });
    assert.equal(current.financial, 'paid'); assert.ok(current.items.every((i) => i.readiness === 'needs_artwork'));
    const requireCrm = createRequire(path.join(process.env.CRM_TEST_ROOT, 'package.json'));
    const png = await requireCrm('sharp')({ create: { width: 100, height: 100, channels: 3, background: '#e63946' } }).png().toBuffer();
    let counter = 0;
    for (const item of current.items) for (const placement of ['front', 'back']) {
        for (const assignment of item.purchased.pieces === 2 ? ['designA', 'designB'] : ['main']) {
            const requestId = 'upload' + (++counter);
            const manifest = { orderId: order.id, lineItemId: item.lineItemId, placement, assignmentId: assignment, allocatedQuantity: 1,
                role: 'source', filename: 'synthetic.png', mime: 'image/png', size: png.length, sha256: createHash('sha256').update(png).digest('hex'), requestId };
            const upload = await invoke('create-upload', manifest, requestId);
            // Real resumable HTTP test boundary: partial bytes, probe, then resume.
            const split = Math.floor(png.length / 2);
            let response = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes 0-${split - 1}/${png.length}` }, body: png.subarray(0, split) });
            assert.equal(response.status, 308);
            response = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes */${png.length}` } });
            assert.equal(response.headers.get('range'), `bytes=0-${split - 1}`);
            response = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes ${split}-${png.length - 1}/${png.length}` }, body: png.subarray(split) });
            assert.equal(response.status, 200);
            const completion = await invoke('complete-upload', { orderId: order.id, sessionId: upload.sessionId }, requestId + '_complete');
            assert.equal((await invoke('complete-upload', { orderId: order.id, sessionId: upload.sessionId }, requestId + '_complete')).assetId, completion.assetId);
        }
    }
    current = await invoke('order', { orderId: order.id });
    assert.equal(current.items[0].assets.length, 4); assert.equal(current.items[1].assets.length, 2);
    assert.ok(current.items.every((i) => i.readiness === 'staff_review'));
    await prepareProofs(backend, order.id);
    current = await invoke('order', { orderId: order.id });
    assert.ok(current.items.every((i) => i.readiness === 'awaiting_proof'));
    const rejected = current.items[0]; const oldProof = rejected.proof.proofId;
    await invoke('decide-proof', { orderId: order.id, lineItemId: rejected.lineItemId, proofId: oldProof, decision: 'changes_requested' }, 'reject1');
    await prepareProofs(backend, order.id);
    current = await invoke('order', { orderId: order.id });
    assert.notEqual(current.items[0].proof.proofId, oldProof);
    assert.equal((await httpCall('decide-proof', { orderId: order.id, lineItemId: rejected.lineItemId, proofId: oldProof, decision: 'approved' }, 'staleapproval')).code, 'proof_stale');
    for (const item of current.items) await invoke('decide-proof', { orderId: order.id, lineItemId: item.lineItemId, proofId: item.proof.proofId, decision: 'approved' }, 'approve_' + item.lineItemId);
    current = await invoke('order', { orderId: order.id });
    assert.ok(current.items.every((i) => i.readiness === 'ready'));
    const staff = async (op, body) => {
        const response = await backend.request(op, JSON.stringify(body), 'preview_staff_only');
        assert.equal(response.ok, true, JSON.stringify(response)); return response.result;
    };
    for (const item of current.items) {
        const release = await staff('release', { orderId: order.id, lineItemId: item.lineItemId });
        assert.equal((await staff('release', { orderId: order.id, lineItemId: item.lineItemId })).workOrderId, release.workOrderId);
        await staff('production-update', { orderId: order.id, lineItemId: item.lineItemId, patch: { stage: 'finished', stageDone: true } });
    }
    const partial = { orderId: order.id, lineItemId: current.items[0].lineItemId, requestId: 'pickup_first', quantity: 1, method: 'pickup', tracking: '' };
    const allocation = await staff('fulfill', partial);
    assert.equal((await staff('fulfill', partial)).allocationId, allocation.allocationId);
    current = await invoke('order', { orderId: order.id });
    assert.equal(current.items[0].fulfilledQuantity, 1); assert.equal(current.items[1].fulfilledQuantity, 0);
    await staff('fulfill', { ...partial, requestId: 'pickup_remaining' });
    await staff('fulfill', { ...partial, lineItemId: current.items[1].lineItemId, requestId: 'pickup_second_item' });
    current = await invoke('order', { orderId: order.id });
    assert.deepEqual(current.items.map((item) => item.fulfilledQuantity), [2, 1]);
    assert.equal(backend.objects.size > 6, true); // original sources and derived/private final assets retained.
    assert.ok([...backend.store.data.values()].filter((v) => v?.notificationOwner).every((v) => v.notificationOwner === 'website'));
    await invoke('request-recovery', { orderId: order.id, email: 'canvas@example.com' });
    assert.equal(mailbox.length, 1);
    await invoke('recover', { token: mailbox[0].token });
    assert.equal((await invoke('order', { orderId: order.id })).id, order.id);
    assert.equal((await httpCall('catalog', {})).code, 'recovery_order_scope');
    assert.equal((await httpCall('create-upload', { orderId: order.id, role: 'final' }, 'bad')).code, 'source_upload_only');
    assert.equal((await httpCall('order', { orderId: order.id }, undefined, '__session=' + '0'.repeat(64))).code, 'session_expired');
    assert.ok(primaryCookie.startsWith('__session='));
});
