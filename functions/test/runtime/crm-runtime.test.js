'use strict';
// Actual exported Functions callbacks + actual Firestore emulator transactions.
// HTTP CRM transport is mocked; this does not test deployed trigger delivery or CRM intake.
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/, 'Firestore emulator required; never fall back to production');
assert.equal(process.env.GCLOUD_PROJECT, 'demo-canvas-integration');
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-canvas-integration' });
process.env.CRM_LEAD_ADAPTER_ENABLED = 'false';
process.env.MERKAD_LEADS_BASE_URL = 'https://crm.example.invalid';
process.env.MERKAD_LEADS_TENANT_SLUG = 'canvas_advertising';
// Inert fixture strings only; no credential is provisioned, installed or read.
process.env.MERKAD_LEADS_KEY_ID = 'emulator-fixture';
process.env.MERKAD_LEADS_SECRET = 'not-a-real-credential';
process.env.MERKAD_LEADS_SERVICE_ALLOWLIST_CONFIRMED = 'true';
process.env.FUNCTIONS_CONFIG_EXPORT = '{}';
for (const key of ['RESEND_API_KEY','TELNYX_API_KEY','SQUARE_ACCESS_TOKEN']) delete process.env[key];
const admin = require('firebase-admin');
const runtime = require('../../index');
const authorization = require('../../crm-test-authorization');
const db = admin.firestore();
const realTransaction = db.runTransaction.bind(db);
let mode = '', calls = [], sequence = 0;
const oldFetch = global.fetch;
global.fetch = async (url, options) => {
    assert.equal(url, 'https://crm.example.invalid/api/v1/tenants/canvas_advertising/leads/intake');
    calls.push({ body: options.body, key: options.headers['Idempotency-Key'] });
    return { status: 201, text: async () => JSON.stringify({ ok: true, code: 'created', data: { leadId: 'crm-local', contactId: 'contact-local', opportunityId: 'opportunity-local' } }) };
};
// Inject failures at transaction boundaries while Firestore still executes all reads/writes.
db.runTransaction = async (callback, ...options) => {
    let leadWrite = false;
    const result = await realTransaction(async transaction => {
        const create = transaction.create.bind(transaction);
        transaction.create = (ref, data) => {
            if (ref.path.startsWith('canvas_leads/')) leadWrite = true;
            if (mode === 'outbox-abort' && ref.path.startsWith('crm_lead_deliveries/')) throw new Error('injected pre-outbox failure');
            return create(ref, data);
        };
        const result = await callback(transaction);
        if (mode === 'lead-abort' && leadWrite) throw new Error('injected before-commit failure');
        return result;
    }, ...options);
    if (mode === 'response-loss' && leadWrite) throw new Error('injected response loss after commit');
    return result;
};
let id, proof, leadRef, proofRef, outboxRef;
const context = () => ({ rawRequest: { ip: '192.0.2.' + sequence, headers: {} } });
const payload = () => ({ submissionId: id, name: 'Emulator Fixture', email: 'fixture@example.invalid', phone: '+15125550199', service: 'vehicle-wrap', source: 'crm_integration_test', message: 'Emulator only', crmTestAuthorizationToken: proof });
const trigger = async () => runtime.syncLeadToCRM.run(await leadRef.get(), { params: { leadId: id }, timestamp: new Date().toISOString() });
beforeEach(async () => {
    mode = ''; calls = []; sequence++;
    id = 'runtime_fixture_' + Date.now() + '_' + sequence;
    process.env.CRM_LEAD_TEST_SUBMISSION_ID = id;
    leadRef = db.collection('canvas_leads').doc(id);
    proofRef = db.collection('crmIntegrationTestAuthorizations').doc(id);
    outboxRef = db.collection('crm_lead_deliveries').doc(id);
    const issued = authorization.issueAuthorization(); proof = issued.token;
    await proofRef.set(issued.record);
});
after(async () => { db.runTransaction = realTransaction; global.fetch = oldFetch; await admin.app().delete(); });

test('runtime: concurrent submissions consume the proof once and create exactly one lead', async () => {
    const results = await Promise.all([runtime.submitPublicLead.run(payload(),context()),runtime.submitPublicLead.run(payload(),context())]);
    assert.equal(results.filter(x=>!x.duplicate).length,1);
    assert.equal(results.filter(x=>x.duplicate).length,1);
    assert.equal((await proofRef.get()).data().consumed,true);
    assert.equal((await leadRef.get()).data().crmIntegrationTestAuthorized,true);
    assert.equal((await db.collection('canvas_leads').where(admin.firestore.FieldPath.documentId(),'==',id).get()).size,1);
    assert.equal(calls.length,0);
});
test('runtime: transaction abort commits neither lead nor consumed proof, then retry succeeds', async () => {
    mode='lead-abort';
    await assert.rejects(runtime.submitPublicLead.run(payload(),context()));
    assert.equal((await leadRef.get()).exists,false);
    assert.equal((await proofRef.get()).data().consumed,false);
    mode=''; assert.equal((await runtime.submitPublicLead.run(payload(),context())).duplicate,false);
    assert.equal((await proofRef.get()).data().consumed,true);
    assert.equal(calls.length,0);
});
test('runtime: commit-success response-loss retry accepts the existing lead without reusing proof', async () => {
    mode='response-loss'; await assert.rejects(runtime.submitPublicLead.run(payload(),context()));
    const saved=(await leadRef.get()).data();
    assert.equal(saved.crmIntegrationTestAuthorized,true);
    assert.equal((await proofRef.get()).data().consumed,true);
    mode=''; const retry=await runtime.submitPublicLead.run({...payload(),crmTestAuthorizationToken:''},context());
    assert.equal(retry.duplicate,true); assert.equal(retry.id,id);
    assert.deepEqual((await leadRef.get()).data(),saved);
    assert.equal(calls.length,0);
});
test('runtime: worker recovers an expired processing lease after proof consumption, preserving exact bytes', async () => {
    await runtime.submitPublicLead.run(payload(),context()); await trigger();
    const original=(await outboxRef.get()).data(); assert.equal(original.status,'accepted');
    await outboxRef.update({status:'processing',processingLeaseExpiresAt:admin.firestore.Timestamp.fromMillis(Date.now()-1000)});
    // Persisted server authorization remains usable even after the proof document is removed.
    await proofRef.delete();
    const held=db.collection('crm_lead_deliveries').doc('historical_held_fixture_'+sequence);
    await held.set({status:'held',serializedBody:'do-not-replay',testAuthorized:true});
    await runtime.processCrmLeadDeliveryQueue.run({});
    const recovered=(await outboxRef.get()).data();assert.equal(recovered.status,'accepted');
    assert.equal(recovered.attemptCount,2);assert.equal(calls.length,2);
    assert.deepEqual(calls[0],calls[1]);assert.equal(recovered.serializedBody,original.serializedBody);
    assert.equal((await held.get()).data().status,'held');
});
test('runtime: worker recreates only the exact authorized missing outbox after trigger failure', async () => {
    await runtime.submitPublicLead.run(payload(),context());
    mode='outbox-abort'; await assert.rejects(trigger(),/pre-outbox failure/);
    assert.equal((await outboxRef.get()).exists,false);assert.equal(calls.length,0);
    mode='';
    const other=db.collection('canvas_leads').doc('historical_lead_fixture_'+sequence);
    await other.set({crmIntegrationTestAuthorized:true,source:'crm_integration_test'});
    await runtime.processCrmLeadDeliveryQueue.run({});
    assert.equal((await outboxRef.get()).data().status,'accepted');assert.equal(calls.length,1);
    assert.equal((await db.collection('crm_lead_deliveries').doc(other.id).get()).exists,false);
    await runtime.processCrmLeadDeliveryQueue.run({});assert.equal(calls.length,1);
    // Exercise the actual notification trigger's suppression branch; no workflow enrollment.
    await runtime.onNewLead.run(await leadRef.get(),{params:{leadId:id}});
    assert.equal((await db.collection('workflowContacts').get()).size,0);
    process.env.CRM_LEAD_TEST_SUBMISSION_ID='';
    await runtime.processCrmLeadDeliveryQueue.run({});assert.equal(calls.length,1);
    assert.equal(process.env.CRM_LEAD_ADAPTER_ENABLED,'false');
});
