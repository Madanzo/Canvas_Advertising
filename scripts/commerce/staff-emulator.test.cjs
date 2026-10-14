'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createRequire } = require('node:module');
const { createHash } = require('node:crypto');
const { loadBackend } = require('./load-backend.cjs');
const { WebsiteCommerce, FirestoreWebsiteStore, hash } = require('../../functions/commerce-adapter');
test('connected website + actual CRM handlers with real demo Auth/Firestore: revoked membership, concurrent drafts and atomic adoption',
    { skip: !process.env.FIREBASE_AUTH_EMULATOR_HOST || !process.env.FIRESTORE_EMULATOR_HOST || !process.env.CRM_TEST_ROOT }, async (t) => {
    assert.equal(process.env.GCLOUD_PROJECT, 'demo-canvas-commerce-isolated');
    assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8186');
    assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, '127.0.0.1:9186');
    const requireCrm = createRequire(path.join(process.env.CRM_TEST_ROOT, 'package.json'));
    const { initializeApp, deleteApp } = requireCrm('firebase-admin/app');
    const { getFirestore } = requireCrm('firebase-admin/firestore');
    const { getAuth } = requireCrm('firebase-admin/auth');
    const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT }, 'website-staff-connected');
    t.after(() => deleteApp(app));
    const db = getFirestore(app), auth = getAuth(app);
    const b = await loadBackend(process.env.CRM_TEST_ROOT, { realPersistence: true }); b.setIsolatedAdmin(db, auth);
    // The only writes are to this disposable demo project. No production keys,
    // seeds, SMTP, Finix/GCS network, or real customer identity is used.
    for (const [key, value] of b.store.data) await db.doc(key).set(value);
    await db.doc('tenants/canvas_test').set({ slug: 'canvas_advertising', rolePermissions: { seller: ['contacts', 'quotes'], quotes_only: ['quotes'], contacts_only: ['contacts'] } });
    await db.doc('tenants/foreign_test').set({ slug: 'foreign_test' });
    const catalogRef = db.doc('tenants/canvas_test/commerceConfig/catalog');
    const catalog = (await catalogRef.get()).data(); catalog.paymentPolicy = { mode: 'deposit', depositBasisPoints: 5000 }; await catalogRef.set(catalog);
    const signup = await fetch('http://127.0.0.1:9186/identitytoolkit.googleapis.com/v1/accounts:signUp?key=emulator', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true })
    });
    assert.equal(signup.status, 200); const user = await signup.json();
    const member = db.doc('tenants/canvas_test/members/' + user.localId); await member.set({ role: 'seller' });
    const config = { enabled: true, staffDraftsEnabled: true, checkoutMode: 'finix_sandbox', legacySquareDisabled: true, legacyLinksDrained: true };
    const store = new FirestoreWebsiteStore(db); await store.transaction(async (tx) => tx.set('config', config));
    let lose = 'staff-quote';
    const transport = async (op, raw, token) => {
        const result = await b.request(op, raw, token);
        if (op === lose && result.ok) { lose = null; throw Error('lost committed response'); }
        return result;
    };
    const service = new WebsiteCommerce({ store, config: async () => config, transport });
    const buyer = await service.session(null, 'emulator_staff'), other = await service.session(null, 'emulator_other');
    const staff = async (op, body, attempt) => service.staffCall(user.idToken, op, body == null ? null : JSON.stringify(body), attempt);
    const publicCall = async (op, body, attempt) => service.call(buyer.cookie, op, body == null ? null : JSON.stringify(body), attempt);
    const contactBody = { requestId: 'emulator_staff_contact', contact: { entityType: 'individual', firstName: 'Synthetic', email: 'emulator@example.com', phone: '5125550106' } };
    for (const role of ['quotes_only', 'contacts_only']) {
        await member.set({ role }); assert.equal((await staff('staff-contact-create', contactBody, 'emulator_staff_contact')).httpStatus, 403);
    }
    await member.set({ role: 'seller' });
    const contacts = await Promise.all([1, 2].map(() => staff('staff-contact-create', contactBody, contactBody.requestId)));
    assert.ok(contacts.every((c) => c.ok)); assert.equal(contacts[0].result.contactId, contacts[1].result.contactId);
    const request = { version: 'canvas-commerce.v1', requestId: 'emulator_staff_quote', catalogVersion: catalog.version, locale: 'en',
        delivery: { methodId: 'pickup', destinationZone: 'shop' }, items: [{ lineItemId: 'emulator_item', productId: 'banner', configuration: {
            dimensions: { width: 3, height: 4, unit: 'ft' }, quantity: 2, options: { material: 'vinyl', finish: 'hem' }, variants: [], artworkMode: 'later', designBrief: '', notes: '' } }] };
    const draftBody = { contactId: contacts[0].result.contactId, quote: request };
    await assert.rejects(staff('staff-quote', draftBody, request.requestId), /lost committed response/);
    const worker = new WebsiteCommerce({ store: new FirestoreWebsiteStore(db), config: async () => config, transport });
    const recovered = await worker.staffCall(user.idToken, 'staff-quote', null, request.requestId); assert.equal(recovered.ok, true);
    const repeated = await Promise.all([1, 2].map(() => staff('staff-quote', draftBody, request.requestId)));
    assert.ok(repeated.every((d) => d.result.quoteId === recovered.result.quoteId));
    const publicQuote = await publicCall('quote', { ...request, requestId: 'emulator_public_quote' }, 'emulator_public_quote');
    for (const key of ['totalMinor', 'taxMinor', 'items', 'paymentPolicy']) assert.deepEqual(publicQuote.result[key], recovered.result[key]);
    for (const collection of ['commerceOrders', 'payments', 'invoices', 'leads', 'workOrders'])
        assert.equal((await db.collection('tenants/canvas_test/' + collection).get()).size, 0);
    const bytes = await requireCrm('sharp')({ create: { width: 24, height: 16, channels: 3, background: 'green' } }).png().toBuffer();
    const manifest = { quoteId: recovered.result.quoteId, lineItemId: 'emulator_item', requestId: 'emulator_art', placement: 'front',
        assignmentId: 'designA', allocatedQuantity: 2, role: 'source', filename: 'synthetic.png', mime: 'image/png', size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex') };
    const reserved = await staff('staff-create-draft-upload', manifest, manifest.requestId); assert.equal(reserved.ok, true);
    const ticket = (await service.buyerTicket(buyer.cookie)).result;
    await staff('staff-assign-draft', { quoteId: recovered.result.quoteId, quoteHash: recovered.result.quoteHash, requestId: 'emulator_assign', buyerTicket: ticket.ticket }, 'emulator_assign');
    assert.equal((await service.call(other.cookie, 'draft', JSON.stringify({ quoteId: recovered.result.quoteId }))).ok, false);
    const resumedUpload = await publicCall('create-draft-upload', manifest, manifest.requestId); assert.equal(resumedUpload.result.sessionId, reserved.result.sessionId);
    const object = b.objects.get(b.uploads.get(reserved.result.sessionId)); object.bytes = bytes; object.complete = true;
    lose = 'complete-draft-upload';
    await assert.rejects(publicCall('complete-draft-upload', { quoteId: recovered.result.quoteId, sessionId: reserved.result.sessionId }, 'emulator_complete'), /lost committed response/);
    const completed = await publicCall('complete-draft-upload', null, 'emulator_complete'); assert.equal(completed.ok, true);
    const refreshedDraft = await publicCall('draft', { quoteId: recovered.result.quoteId });
    assert.equal(refreshedDraft.result.assets[0].assetId, completed.result.assetId);
    const checkout = { version: 'canvas-commerce.v1', quoteId: recovered.result.quoteId, acceptedHash: recovered.result.quoteHash,
        termsVersion: recovered.result.termsVersion, sourceOrderId: 'emulator_adoption', contact: { name: 'Synthetic', email: 'emulator@example.com', phone: '5125550106' } };
    lose = 'checkout'; await assert.rejects(publicCall('checkout', checkout, checkout.sourceOrderId), /lost committed response/);
    const order = await publicCall('checkout', null, checkout.sourceOrderId); assert.equal(order.ok, true);
    assert.equal((await db.collection('tenants/canvas_test/commerceOrders').get()).size, 1);
    assert.equal((await db.collection('tenants/canvas_test/contacts').get()).size, 1);
    const currentOrder = (await publicCall('order', { orderId: order.result.id })).result;
    assert.equal(currentOrder.requiredMinor, Math.ceil(publicQuote.result.totalMinor / 2));
    assert.equal(currentOrder.items[0].assets[0].assetId, completed.result.assetId);
    assert.equal((await publicCall('draft', { quoteId: recovered.result.quoteId })).result.orderId, order.result.id);
    const binding = (await db.doc('canvas_commerce_private/buyer_' + hash(ticket.ticket)).get()).data(); assert.ok(binding.binding);
    await member.delete(); assert.equal((await staff('staff-quote', null, request.requestId)).httpStatus, 403);
    await member.set({ role: 'seller' }); await auth.updateUser(user.localId, { disabled: true });
    assert.equal((await staff('staff-quote', null, request.requestId)).httpStatus, 401);
});
