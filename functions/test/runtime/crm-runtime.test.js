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
const runtime = process.env.CRM_SPLIT_OVERLAY_RUNTIME === 'true'
    ? require('./split-overlay-loader.cjs')()
    : require('../../index');
const admin = runtime.__splitAdmin || require('firebase-admin');
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
const trigger = async () => runtime.onCanvasLeadForCRM.run(await leadRef.get(), { params: { leadId: id }, timestamp: new Date().toISOString() });
beforeEach(async () => {
    mode = ''; calls = []; sequence++;
    for (const key of Object.keys(process.env)) {
        if (key.startsWith('CANVAS_') || key.startsWith('CRM_COMMUNICATIONS_')) delete process.env[key];
    }
    id = 'runtime_fixture_' + Date.now() + '_' + sequence;
    process.env.CRM_LEAD_TEST_SUBMISSION_ID = id;
    leadRef = db.collection('canvas_leads').doc(id);
    proofRef = db.collection('crmIntegrationTestAuthorizations').doc(id);
    outboxRef = db.collection('crm_lead_deliveries').doc(id);
    const issued = authorization.issueAuthorization(); proof = issued.token;
    await proofRef.set(issued.record);
});
after(async () => { db.runTransaction = realTransaction; global.fetch = oldFetch; if(runtime.__splitDispose) await runtime.__splitDispose(); else await admin.app().delete(); });

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

if (process.env.CRM_SPLIT_OVERLAY_RUNTIME === 'true') {
    test('split overlay: actual proof issuer rejects anonymous, unverified, wrong staff and wrong exact ID', async()=>{
        for (const auth of [undefined,{uid:'fixture',token:{email:'sales@canvas-advertising.com',email_verified:false}},{uid:'fixture',token:{email:'other@example.invalid',email_verified:true}}]) {
            await assert.rejects(runtime.createCrmIntegrationTestAuthorization.run({submissionId:id},{auth}), /Verified Canvas staff/);
        }
        const staff={auth:{uid:'fixture-staff',token:{email:'sales@canvas-advertising.com',email_verified:true}}};
        await assert.rejects(runtime.createCrmIntegrationTestAuthorization.run({submissionId:'wrong_fixture_id_000'},staff), /exact disabled-mode/);
        const issued=await runtime.createCrmIntegrationTestAuthorization.run({submissionId:id},staff);
        assert.ok(issued.token);assert.equal((await proofRef.get()).data().createdByUid,'fixture-staff');
        proof=issued.token;await runtime.submitPublicLead.run(payload(),context());
        assert.equal((await proofRef.get()).data().consumed,true);
        assert.equal((await leadRef.get()).data().communications.testSuppressed,true);
        assert.equal(calls.length,0);
    });
    test('split overlay: CRM ownership suppresses actual notification trigger/direct send and preserves immutable outbox',async()=>{
        process.env.CANVAS_CRM_OWNED_PURPOSES='["lead_received"]';
        process.env.CANVAS_COMMUNICATIONS_TRANSITION_ID='emulator_epoch_2026';
        process.env.CANVAS_COMMUNICATIONS_CUTOVER_AT='2026-01-01T00:00:00.000Z';
        for(const gate of ['INTAKE','EMAIL','SMS','CONSENT','IDEMPOTENCY','SUPPRESSION']) process.env['CRM_COMMUNICATIONS_'+gate+'_READY']='true';
        await runtime.submitPublicLead.run(payload(),context());
        const saved=(await leadRef.get()).data();assert.equal(saved.communications.notificationOwner,'crm');
        await db.collection('canvas_workflows').doc('split_fixture_workflow').set({enabled:true,trigger:'form_submit',steps:[{type:'email'},{type:'sms'}]});
        await runtime.onNewLead.run(await leadRef.get(),{params:{leadId:id}});
        assert.equal((await db.collection('workflowContacts').get()).size,0);
        for(const type of ['email','sms']) {
            await assert.rejects(runtime.sendDirectMessage.run({contactId:id,type,subject:'Fixture',content:'Fixture',recipient:'fixture@example.invalid'},{auth:{uid:'fixture'}}), /website_communications_suppressed/);
        }
        await trigger();const original=(await outboxRef.get()).data();
        assert.equal(JSON.parse(original.serializedBody).notificationOwner,'crm');assert.equal(JSON.parse(original.serializedBody).testSuppressed,true);
        const count=calls.length;
        process.env.CANVAS_CRM_OWNED_PURPOSES='[]';
        await runtime.onNewLead.run(await leadRef.get(),{params:{leadId:id}});
        await runtime.processCrmLeadDeliveryQueue.run({});
        assert.equal(calls.length,count);assert.deepEqual((await outboxRef.get()).data(),original);
        assert.equal((await db.collection('workflowContacts').get()).size,0);
    });
    test('split overlay: unready cutover delivers valid lead with enrollment suppressed; visitor ownership cannot override server policy',async()=>{
        process.env.CANVAS_CRM_OWNED_PURPOSES='["lead_received"]';
        await assert.rejects(runtime.submitPublicLead.run({...payload(),communications:{notificationOwner:'website'}},context()),/not allowed|unsupported|Unexpected|Unknown/i);
        await runtime.submitPublicLead.run(payload(),context());
        assert.equal((await leadRef.get()).data().communications.notificationOwner,'website');
        await runtime.onNewLead.run(await leadRef.get(),{params:{leadId:id}});await trigger();
        assert.equal((await outboxRef.get()).data().status,'accepted');assert.equal(calls.length,1);
        assert.equal(JSON.parse((await outboxRef.get()).data().serializedBody).testSuppressed,true);
    });
}

if (process.env.CRM_SPLIT_OVERLAY_RUNTIME === 'true') test('purpose scope: real public capture, mixed workflow, and rollback preserve non-receipt scheduling without replay',async()=>{
    process.env.CRM_LEAD_TEST_SUBMISSION_ID='';
    process.env.CANVAS_CRM_OWNED_PURPOSES='["lead_received"]';
    process.env.CANVAS_WORKFLOW_ELIGIBLE_FROM='2026-01-01T00:00:00.000Z';
    process.env.CANVAS_COMMUNICATIONS_TRANSITION_ID='purpose_emulator_epoch';
    process.env.CANVAS_COMMUNICATIONS_CUTOVER_AT='2026-01-01T00:00:00.000Z';
    for(const gate of ['INTAKE','EMAIL','SMS','CONSENT','IDEMPOTENCY','SUPPRESSION']) process.env['CRM_COMMUNICATIONS_'+gate+'_READY']='true';
    const publicId='purpose_public_'+Date.now();
    const input={submissionId:publicId,name:'Synthetic Purpose',email:'purpose@example.invalid',phone:'+15125550198',service:'vehicle-wrap',source:'booking'};
    await assert.rejects(runtime.submitPublicLead.run({...input,purpose:'booking'},context()),/not allowed|unsupported|Unexpected|Unknown/i);
    await runtime.submitPublicLead.run(input,context());
    const ref=db.collection('canvas_leads').doc(publicId);const saved=await ref.get();
    assert.equal(saved.data().communications.purpose,'lead_received');assert.equal(saved.data().communications.notificationOwner,'crm');
    await db.collection('canvas_workflows').doc('purpose_mixed_fixture').set({enabled:true,trigger:'form_submit',steps:[{type:'email',templateId:'welcome'},{type:'sms',templateId:'sms_welcome',delay:2,unit:'minutes'},{type:'email',templateId:'follow_up_no_response',delay:2,unit:'days'}]});
    await runtime.onNewLead.run(saved,{params:{leadId:publicId}});
    const instances=await db.collection('workflowContacts').where('contactId','==',publicId).get();assert.equal(instances.size,1);
    const instance=instances.docs[0];assert.equal(instance.data().communicationOrigin,'form_submit');
    await runtime.__splitProcessInstance(instance);assert.equal((await instance.ref.get()).data().currentStepIndex,1);
    process.env.CANVAS_CRM_OWNED_PURPOSES='[]';
    await runtime.__splitProcessInstance(await instance.ref.get());
    const after=await instance.ref.get();assert.equal(after.data().currentStepIndex,2);assert.ok(after.data().nextExecutionAt.toMillis()>Date.now()+47*60*60*1000);
    const held=db.collection('workflowContacts').doc('purpose_historical_held');await held.set({status:'held',currentStepIndex:0,nextExecutionAt:admin.firestore.Timestamp.fromMillis(1),history:[]});
    const heldBefore=(await held.get()).data();await runtime.processWorkflowQueue.run({});
    assert.deepEqual((await held.get()).data(),heldBefore);assert.deepEqual((await instance.ref.get()).data(),after.data());assert.equal(calls.length,0);
});

if (process.env.CRM_SPLIT_OVERLAY_RUNTIME === 'true') {
 test('consolidated: actual worker leaves active/due historical and unknown work byte-identical with zero transports',async()=>{
    process.env.CANVAS_WORKFLOW_ELIGIBLE_FROM='2026-01-01T00:00:00.000Z';
    const lead=db.collection('canvas_leads').doc('historical_refusal');await lead.set({name:'Synthetic historical'});
    await db.collection('canvas_workflows').doc('historical_refusal_wf').set({trigger:'form_submit',steps:[{type:'email',templateId:'welcome'}]});
    const job=db.collection('workflowContacts').doc('historical_refusal_job');await job.set({contactId:lead.id,workflowId:'historical_refusal_wf',status:'active',currentStepIndex:0,nextExecutionAt:admin.firestore.Timestamp.fromMillis(1)});
    const original=(await job.get()).data();await runtime.processWorkflowQueue.run({});assert.deepEqual((await job.get()).data(),original);assert.equal(calls.length,0);
    // An empty workflow must not complete or mutate an ineligible persisted instance.
    await db.collection('canvas_workflows').doc('historical_refusal_wf').update({steps:[]});
    await runtime.processWorkflowQueue.run({});assert.deepEqual((await job.get()).data(),original);assert.equal(calls.length,0);
    // Valid new server capture/grant cannot authorize an unknown message definition.
    const policy=require('../../communications-policy');const stamp=policy.capture(policy.configFromEnv(process.env));await lead.set({communications:stamp});
    await job.update({communicationEligibility:policy.workflowGrant(policy.configFromEnv(process.env),{communications:stamp})});
    await db.collection('canvas_workflows').doc('historical_refusal_wf').update({steps:[{type:'email',templateId:'unknown',purpose:'follow_up'}]});
    const unknown=(await job.get()).data();await runtime.processWorkflowQueue.run({});assert.deepEqual((await job.get()).data(),unknown);assert.equal(calls.length,0);
 });
 test('consolidated: receipt obligation commits with lead, survives outbox failure/config loss and never auto-resolves on retry',async()=>{
    process.env.CANVAS_CRM_OWNED_PURPOSES='["lead_received"]';process.env.CANVAS_COMMUNICATIONS_TRANSITION_ID='recovery_emulator_epoch';process.env.CANVAS_COMMUNICATIONS_CUTOVER_AT='2026-01-01T00:00:00.000Z';
    for(const gate of ['INTAKE','EMAIL','SMS','CONSENT','IDEMPOTENCY','SUPPRESSION'])process.env['CRM_COMMUNICATIONS_'+gate+'_READY']='true';
    const ordinary=payload();delete ordinary.crmTestAuthorizationToken;ordinary.source='website';
    await runtime.submitPublicLead.run(ordinary,context());const saved=(await leadRef.get()).data();assert.equal(saved.receiptObligation.status,'unresolved');assert.equal(saved.receiptObligation.capturedAt,saved.communications.capturedAt);
    mode='outbox-abort';await assert.rejects(trigger(),/pre-outbox/);assert.equal((await outboxRef.get()).exists,false);assert.deepEqual((await leadRef.get()).data().receiptObligation,saved.receiptObligation);
    mode='';delete process.env.CANVAS_CRM_OWNED_PURPOSES;await trigger();const frozen=(await outboxRef.get()).data();assert.equal(JSON.parse(frozen.serializedBody).testSuppressed,true);
    const review=(await leadRef.get()).data().receiptReview;assert.equal(review.status,'unresolved');assert.equal(review.reason,'enrollment_suppressed_requires_review');
    process.env.CANVAS_CRM_OWNED_PURPOSES='["lead_received"]';await trigger();const retried=(await outboxRef.get()).data();assert.equal(retried.serializedBody,frozen.serializedBody);assert.equal(retried.idempotencyKey,frozen.idempotencyKey);assert.deepEqual(retried.createdAt,frozen.createdAt);
    assert.deepEqual((await leadRef.get()).data().receiptObligation,saved.receiptObligation);assert.deepEqual((await leadRef.get()).data().receiptReview,review);
    const recovery=require('../../receipt-recovery');const authority={authenticated:true,role:'communications_reviewer',actorId:'emulator-operator',leadId:id,approvalId:'review_emulator_01'};
    const recorded=await recovery.recordReview(db,id,authority);assert.equal(recorded.decision.maySend,false);assert.deepEqual(await recovery.recordReview(db,id,authority),recorded);assert.equal((await leadRef.collection('receiptRecoveryReviews').get()).size,1);
    await assert.rejects(recovery.recordReview(db,id,{...authority,authenticated:false}));assert.equal((await leadRef.get()).data().receiptObligation.status,'unresolved');
    assert.ok(calls.every(c=>JSON.parse(c.body).testSuppressed===true)); // CRM HTTP mocked, no SMS/email boundary available
 });
}
