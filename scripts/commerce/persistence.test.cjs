'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { createRequire } = require('node:module');
const { WebsiteCommerce, FirestoreWebsiteStore } = require('../../functions/commerce-adapter');
test('real Firestore emulator: durable exact retries, atomic scoped recovery and deny direct customer persistence access',
    { skip: !process.env.FIRESTORE_EMULATOR_HOST || !process.env.CRM_TEST_ROOT }, async (t) => {
    assert.equal(process.env.GCLOUD_PROJECT, 'demo-canvas-commerce-isolated');
    assert.equal(process.env.FIRESTORE_EMULATOR_HOST, '127.0.0.1:8186');
    const requireCrm = createRequire(path.join(process.env.CRM_TEST_ROOT, 'package.json'));
    const { initializeApp, deleteApp } = requireCrm('firebase-admin/app');
    const { getFirestore } = requireCrm('firebase-admin/firestore');
    const { initializeTestEnvironment, assertFails } = requireCrm('@firebase/rules-unit-testing');
    const environment = await initializeTestEnvironment({ projectId: process.env.GCLOUD_PROJECT,
        firestore: { host: '127.0.0.1', port: 8186, rules: fs.readFileSync(path.resolve(__dirname, '../../firestore.rules'), 'utf8') } });
    t.after(() => environment.cleanup());
    const app = initializeApp({ projectId: process.env.GCLOUD_PROJECT }, 'website-commerce-test');
    t.after(() => deleteApp(app));
    const db = getFirestore(app); const store = new FirestoreWebsiteStore(db); const letters = [];
    const config = async () => ({ enabled: true, checkoutMode: 'finix_sandbox', legacySquareDisabled: true, legacyLinksDrained: true });
    await store.transaction(async (tx) => tx.set('config', await config()));
    let interrupted = true; const received = [];
    const transport = async (operation, raw) => {
        if (operation === 'session') return { ok: true, result: { token: 'test_server_capability' } };
        received.push(raw);
        if (interrupted) { interrupted = false; throw new Error('interrupted'); }
        return { ok: true, result: { id: 'emulator_order' } };
    };
    const service = new WebsiteCommerce({ store, config, transport, sendRecovery: async (letter) => letters.push(letter) });
    const session = await service.session(null, 'emulator');
    const raw = ' {"sourceOrderId":"emulator_order", "contact":{"email":"emulator@example.com"}}';
    await assert.rejects(service.call(session.cookie, 'checkout', raw, 'emulator_order'), /interrupted/);
    const restarted = new WebsiteCommerce({ store: new FirestoreWebsiteStore(db), config, transport,
        sendRecovery: async (letter) => letters.push(letter) });
    assert.equal((await restarted.call(session.cookie, 'checkout', null, 'emulator_order')).result.id, 'emulator_order');
    assert.deepEqual(received, [raw, raw]);
    await restarted.requestRecovery('emulator_order', 'emulator@example.com', 'emulator');
    const token = letters[0].token;
    const failingStore = new FirestoreWebsiteStore(db); let fail = true;
    const original = failingStore.transaction.bind(failingStore);
    failingStore.transaction = (callback) => original(async (tx) => {
        const result = await callback(tx); if (fail) { fail = false; throw new Error('transaction failure'); } return result;
    });
    const recovering = new WebsiteCommerce({ store: failingStore, config, transport });
    await assert.rejects(recovering.recover(token), /transaction failure/);
    const recovery = await Promise.all(Array.from({ length: 6 }, () => restarted.recover(token)));
    assert.equal(new Set(recovery.map((r) => r.cookie)).size, 1);
    assert.equal((await restarted.principal(recovery[0].cookie)).orderId, 'emulator_order');
    await assert.rejects(restarted.call(recovery[0].cookie, 'order', '{"orderId":"another_order"}'), /recovery_order_scope/);
    const { doc, getDoc, setDoc, getDocs, collection } = requireCrm('firebase/firestore');
    for (const context of [environment.unauthenticatedContext(), environment.authenticatedContext('not_staff')]) {
        const firestore = context.firestore();
        await assertFails(getDoc(doc(firestore, 'canvas_commerce_private/config')));
        await assertFails(setDoc(doc(firestore, 'canvas_commerce_private/config'), { enabled: true }));
        await assertFails(getDocs(collection(firestore, 'canvas_commerce_private')));
    }
});
