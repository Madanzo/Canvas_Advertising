'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { startPreview } = require('./preview-server.cjs');
const { WebsiteCommerce } = require('../../functions/commerce-adapter');

test('website HTTP → pinned CRM handlers: staff parity, authority, immutable draft art and atomic buyer adoption',
    { skip: !process.env.CRM_TEST_ROOT }, async (t) => {
    const preview = await startPreview({ port: 0 });
    t.after(() => new Promise((resolve) => preview.server.close(resolve)));
    const origin = preview.origin;
    const { service, backend, websiteStore } = preview;
    const invoke = async (operation, body, attemptId, token, cookie) => {
        const headers = { origin, 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}), ...(cookie ? { cookie } : {}) };
        const input = operation === 'website-session' ? { operation } : { operation,
            serializedBody: body == null ? null : typeof body === 'string' ? body : JSON.stringify(body), attemptId };
        const response = await fetch(origin + '/api/commerce', { method: 'POST', headers, body: JSON.stringify(input) });
        return { ...await response.json(), status: response.status, cookie: response.headers.get('set-cookie')?.split(';')[0] };
    };
    const ok = async (...args) => { const r = await invoke(...args); assert.equal(r.ok, true, JSON.stringify(r)); return r.result; };
    const buyerCookie = (await invoke('website-session')).cookie;
    const otherCookie = (await invoke('website-session')).cookie;
    const admin = backend.staffTokens.admin;
    const config = backend.store.data.get('tenants/canvas_test/commerceConfig/catalog');
    config.paymentPolicy = { mode: 'deposit', depositBasisPoints: 5000 };
    config.products[0].requiredPlacements = ['front', 'back'];
    const request = { version: 'canvas-commerce.v1', requestId: 'staff_quote_one', catalogVersion: config.version,
        locale: 'en', delivery: { methodId: 'pickup', destinationZone: 'shop' },
        items: [2, 1].map((quantity, i) => ({ lineItemId: 'draft_item_' + i, productId: 'banner',
            configuration: { dimensions: { width: 3, height: 4, unit: 'ft' }, quantity,
                options: { material: 'vinyl', finish: 'hem' }, variants: [], artworkMode: 'now', designBrief: '', notes: '' } })) };
    const contactBody = '{ "requestId":"staff_contact_one", "contact":{"entityType":"individual","firstName":"Synthetic","lastName":"Buyer","email":"staff-buyer@example.com","phone":"5125550106"} }';
    const noPurchase = () => assert.deepEqual([...backend.store.data.keys()].filter((k) =>
        /\/(payments|commercePaymentAttempts|commerceOrders|invoices|leads|workOrders|commerceOutbox|commerceEvents)\//.test(k)), []);
    for (const token of [undefined, backend.staffTokens.quotes_only, backend.staffTokens.contacts_only, backend.staffTokens.outsider]) {
        const denied = await invoke('staff-contact-create', contactBody, 'staff_contact_one', token);
        assert.equal(denied.ok, false);
        assert.ok([401, 403].includes(denied.status));
    }
    assert.equal((await invoke('staff-contact-create', contactBody, 'staff_contact_one')).ok, false, 'public cannot promote itself');
    const original = service.transport; let lose = 'staff-contact-create';
    service.transport = async (op, raw, token) => {
        const result = await original(op, raw, token);
        if (op === lose && result.ok) { lose = null; throw new Error('lost committed response'); }
        return result;
    };
    assert.equal((await invoke('staff-contact-create', contactBody, 'staff_contact_one', admin)).code, 'delivery_uncertain');
    const contact = await ok('staff-contact-create', null, 'staff_contact_one', admin);
    const duplicates = await Promise.all([1, 2].map(() => ok('staff-contact-create', contactBody, 'staff_contact_one', admin)));
    assert.ok(duplicates.every((c) => c.contactId === contact.contactId));
    assert.equal([...backend.store.data.keys()].filter((k) => /\/contacts\//.test(k)).length, 1);
    assert.equal((await invoke('staff-contact-create', contactBody.replace('Synthetic', 'Changed'), 'staff_contact_one', admin)).code, 'idempotency_conflict');
    const found = await ok('staff-contact-lookup', { by: 'email', value: 'staff-buyer@example.com' }, null, admin);
    assert.equal(found.contacts[0].contactId, contact.contactId);
    lose = 'staff-quote';
    const rawQuote = JSON.stringify({ contactId: contact.contactId, quote: request });
    assert.equal((await invoke('staff-quote', rawQuote, request.requestId, admin)).code, 'delivery_uncertain');
    // New website worker instance resumes exact persisted bytes, no JWT persisted.
    const resumed = new WebsiteCommerce({ store: websiteStore, config: service.config, transport: service.transport });
    const staffQuote = (await resumed.staffCall(admin, 'staff-quote', null, request.requestId)).result;
    const repeated = await Promise.all([1, 2].map(() => ok('staff-quote', rawQuote, request.requestId, admin)));
    assert.ok(repeated.every((q) => q.quoteId === staffQuote.quoteId));
    const publicQuote = await ok('quote', { ...request, requestId: 'public_quote_one' }, 'public_quote_one', null, buyerCookie);
    for (const field of ['subtotalMinor', 'shippingMinor', 'taxMinor', 'totalMinor', 'paymentPolicy', 'items'])
        assert.deepEqual(staffQuote[field], publicQuote[field], field + ' shares pricing authority');
    assert.equal(staffQuote.paymentPolicy.depositBasisPoints, 5000);
    noPurchase();
    backend.controls.revokedStaff = true;
    assert.equal((await invoke('staff-quote', null, request.requestId, admin)).status, 401, 'accepted retry still checks revocation');
    backend.controls.revokedStaff = false;
    assert.equal((await invoke('staff-draft', { quoteId: staffQuote.quoteId }, null, backend.staffTokens.outsider)).status, 403);
    assert.equal((await invoke('draft', { quoteId: staffQuote.quoteId }, null, null, otherCookie)).ok, false);
    const requireCrm = createRequire(path.join(process.env.CRM_TEST_ROOT, 'package.json'));
    const png = await requireCrm('sharp')({ create: { width: 100, height: 100, channels: 3, background: '#e63946' } }).png().toBuffer();
    const manifest = { quoteId: staffQuote.quoteId, lineItemId: request.items[0].lineItemId, requestId: 'draft_art_one',
        placement: 'front', assignmentId: 'designA', allocatedQuantity: 1, role: 'source', filename: 'synthetic.png',
        mime: 'image/png', size: png.length, sha256: createHash('sha256').update(png).digest('hex') };
    lose = 'staff-create-draft-upload';
    assert.equal((await invoke('staff-create-draft-upload', manifest, manifest.requestId, admin)).code, 'delivery_uncertain');
    const upload = await ok('staff-create-draft-upload', null, manifest.requestId, admin);
    const draft = await ok('staff-draft', { quoteId: staffQuote.quoteId }, null, admin);
    assert.equal(draft.uploads[0].sessionId, upload.sessionId);
    assert.equal(draft.uploads[0].completed, false);
    assert.ok(!JSON.stringify(draft).includes('objectKey'));
    const ticket = await ok('buyer-ticket', null, null, null, buyerCookie);
    assert.equal((await invoke('staff-assign-draft', { quoteId: staffQuote.quoteId, customerId: 'forged', requestId: 'assign', quoteHash: staffQuote.quoteHash }, 'assign', admin)).code, 'forbidden_field');
    const assignment = { quoteId: staffQuote.quoteId, requestId: 'assign', quoteHash: staffQuote.quoteHash, buyerTicket: ticket.ticket };
    lose = 'staff-assign-draft';
    assert.equal((await invoke('staff-assign-draft', assignment, 'assign', admin)).code, 'delivery_uncertain');
    await ok('staff-assign-draft', null, 'assign', admin);
    assert.equal((await invoke('staff-assign-draft', { ...assignment, quoteId: publicQuote.quoteId, requestId: 'other_assignment' }, 'other_assignment', admin)).code, 'buyer_ticket_unavailable');
    const buyerDraft = await ok('draft', { quoteId: staffQuote.quoteId }, null, null, buyerCookie);
    assert.equal(buyerDraft.uploads[0].sessionId, upload.sessionId);
    const buyerResume = await ok('create-draft-upload', manifest, manifest.requestId, null, buyerCookie);
    assert.equal(buyerResume.sessionId, upload.sessionId, 'staff-to-buyer keeps pending upload identity');
    const checkout = { version: 'canvas-commerce.v1', quoteId: staffQuote.quoteId, acceptedHash: staffQuote.quoteHash,
        termsVersion: staffQuote.termsVersion, sourceOrderId: 'draft_purchase_one',
        contact: { name: 'Do not overwrite existing contact', email: 'staff-buyer@example.com', phone: '5125550106' } };
    assert.equal((await invoke('checkout', checkout, checkout.sourceOrderId, null, buyerCookie)).ok, false, 'pending upload blocks adoption');
    const transfer = await fetch(buyerResume.uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes 0-${png.length - 1}/${png.length}` }, body: png });
    assert.equal(transfer.status, 200);
    lose = 'complete-draft-upload';
    assert.equal((await invoke('complete-draft-upload', { quoteId: staffQuote.quoteId, sessionId: upload.sessionId }, 'complete_one', null, buyerCookie)).code, 'delivery_uncertain');
    const completed = await ok('complete-draft-upload', null, 'complete_one', null, buyerCookie);
    assert.equal(completed.assetId, upload.sessionId);
    const refreshed = await ok('draft', { quoteId: staffQuote.quoteId }, null, null, buyerCookie);
    assert.equal(refreshed.assets[0].assetId, completed.assetId);
    assert.equal(refreshed.uploads[0].completed, true);
    assert.equal((await invoke('create-draft-upload', { ...manifest, assignmentId: 'changed' }, 'changed_attempt', null, buyerCookie)).ok, false);
    const replacementManifest = { ...manifest, requestId: 'draft_art_revision', filename: 'revision.png' };
    const revision = await ok('create-draft-upload', replacementManifest, replacementManifest.requestId, null, buyerCookie);
    await fetch(revision.uploadUrl, { method: 'PUT', headers: { 'Content-Range': `bytes 0-${png.length - 1}/${png.length}` }, body: png });
    const revisedAsset = await ok('complete-draft-upload', { quoteId: staffQuote.quoteId, sessionId: revision.sessionId }, 'complete_revision', null, buyerCookie);
    assert.notEqual(revisedAsset.assetId, completed.assetId);
    assert.equal((await ok('complete-draft-upload', null, 'complete_one', null, buyerCookie)).assetId, completed.assetId);
    const revisedDraft = await ok('draft', { quoteId: staffQuote.quoteId }, null, null, buyerCookie);
    assert.equal(revisedDraft.uploads.length, 2, 'old immutable receipt retained');
    assert.equal(revisedDraft.assets[0].assetId, revisedAsset.assetId, 'older retry cannot replace current assignment');
    noPurchase();
    lose = 'checkout';
    assert.equal((await invoke('checkout', checkout, checkout.sourceOrderId, null, buyerCookie)).code, 'delivery_uncertain');
    const purchased = await ok('checkout', null, checkout.sourceOrderId, null, buyerCookie);
    const order = await ok('order', { orderId: purchased.id }, null, null, buyerCookie);
    assert.equal(order.contactId, contact.contactId);
    assert.equal(order.capturedMinor, 0);
    assert.equal(order.requiredMinor, Math.ceil(order.totalMinor / 2));
    assert.equal(order.items[0].assets[0].assetId, revisedAsset.assetId);
    assert.equal(order.items[0].assets[0].assignmentId, 'designA');
    assert.equal((await ok('draft', { quoteId: staffQuote.quoteId }, null, null, buyerCookie)).orderId, purchased.id);
    assert.equal((await ok('complete-draft-upload', { quoteId: staffQuote.quoteId, sessionId: upload.sessionId }, 'after_purchase', null, buyerCookie)).assetId, completed.assetId, 'committed receipt remains recoverable');
    assert.equal((await invoke('create-draft-upload', { ...manifest, requestId: 'new_after_purchase' }, 'new_after_purchase', null, buyerCookie)).ok, false);
    assert.equal([...backend.store.data.keys()].filter((k) => /\/commerceOrders\//.test(k)).length, 1);
    for (const name of ['payments', 'commercePaymentAttempts', 'leads', 'workOrders'])
        assert.equal([...backend.store.data.keys()].filter((k) => k.includes('/' + name + '/')).length, 0);
    assert.ok(!JSON.stringify([...websiteStore.data.values()]).includes(admin), 'no staff tokens persisted');
    assert.ok(!JSON.stringify([...websiteStore.data.values()]).includes(ticket.ticket), 'only ticket digest persisted');
    assert.ok(!JSON.stringify(order).match(/materialMinor|laborHourlyMinor|supplierCost/));
});
