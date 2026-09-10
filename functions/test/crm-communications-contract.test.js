'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const adapter = require('../crm-lead-adapter');
const policy = require('../communications-policy');
const contract = require('./fixtures/crm-contract-ebed548.cjs');
const now = new Date('2026-09-11T12:00:00.000Z');
const config = {owner:'crm',transitionId:'canvas-transition-fixture',cutoverAt:'2026-09-11T00:00:00.000Z',...Object.fromEntries(policy.GATES.map(k=>[k,true]))};
const lead = {name:'Synthetic Contract',email:'contract@example.invalid',phone:'+15125550142',service:'vehicle_wraps',createdAt:'2026-09-11T10:00:00.000Z',boatSurvey:{smsConsent:true},communications:policy.capture(config,new Date('2026-09-11T10:00:00.000Z'))};
const crmPolicy = {enabled:true,readinessApproved:true,notificationOwner:'crm',policyVersion:1,transitionId:config.transitionId,cutoverAt:config.cutoverAt};
function check(record,configuration=config) {
    const output=adapter.buildRequestMapping('contract-fixture',record,now.toISOString(),configuration);
    const body=JSON.parse(output.serializedBody);
    assert.equal(contract.validateIntake(body).ok,true);
    const decision=contract.decideEnrollment({policy:crmPolicy,envelope:body,consent:contract.withConsentChange(contract.emptyConsent(),'sms','granted','website_form',now),channel:'sms',serverReceivedAt:now});
    return {body,decision};
}
test('actual adapter serialized output satisfies exact canonical CRM validator and enrollment contract',()=>{
    const {body,decision}=check(lead);assert.equal(decision.enroll,true);
    assert.equal(body.policyVersion,1);assert.equal(body.communicationPolicyVersion,undefined);
    assert.equal(body.capturedAt,lead.communications.capturedAt);
});
test('visitor top-level envelope overrides never affect trusted capture',()=>{
    const overrides={notificationOwner:'website',policyVersion:99,transitionId:'attacker',capturedAt:'2099-01-01',testSuppressed:false};
    assert.deepEqual(check({...lead,...overrides}),check(lead));
    const historical={...lead,...overrides};delete historical.communications;
    const {body,decision}=check(historical);assert.equal(decision.enroll,false);assert.equal(body.capturedAt,undefined);assert.equal(body.testSuppressed,true);
});
test('absent/unready transition preserves valid lead and suppresses enrollment',()=>{
    for(const cfg of [{},{owner:'website'},{...config,transitionId:''},...policy.GATES.map(k=>({...config,[k]:false}))]) {
        const {body,decision}=check(lead,cfg);assert.equal(decision.enroll,false);assert.equal(body.testSuppressed,true);
        assert.equal(body.capturedAt,lead.communications.capturedAt);
    }
});
test('missing, malformed, historical and test captures do not acquire the forwarding timestamp',()=>{
    for(const stamp of [undefined,{}, {...lead.communications,capturedAt:'invalid'},policy.capture({owner:'website'},new Date('2026-08-01')), {...lead.communications,capturedAt:'2026-08-01T00:00:00.000Z'}, {...lead.communications,testSuppressed:undefined}, {...lead.communications,testSuppressed:true}]) {
        const {body,decision}=check({...lead,communications:stamp});assert.equal(decision.enroll,false);assert.equal(body.testSuppressed,true);
        assert.notEqual(body.capturedAt,now.toISOString());
    }
    assert.equal(check({...lead,crmIntegrationTestAuthorized:true}).decision.enroll,false);
    assert.equal(check({...lead,communications:{...lead.communications,capturedAt:'2099-01-01T00:00:00.000Z'}}).decision.refusal,'captured_in_future');
});
test('actual create adapter retains first serialized payload/key/capture across duplicate events and configuration drift',async()=>{
    const source=fs.readFileSync(require.resolve('../index'),'utf8');
    const start=source.indexOf('async function createCrmLeadDelivery('),end=source.indexOf('\nexports.processCrmLeadDeliveryQueue',start);
    let stored;const deliveries=[];const ref={get:async()=>({data:()=>stored})};
    const context={crmLeadAdapter:adapter,communicationsPolicy:policy,crmLeadIdempotencyKey:adapter.idempotencyKeyFor,crmLeadAdapterConfig:()=>({serviceAllowlistConfirmed:true}),crmLeadDeliveryReadiness:()=>({ready:true}),CRM_LEAD_DELIVERIES_COLLECTION:'fixture',process:{env:{}},db:{collection:()=>({doc:()=>ref})},admin:{firestore:{FieldValue:{serverTimestamp:()=>0}}},crmTestState:{createOutboxIfAbsent:async(_db,_ref,value)=>{stored??=value;}},deliverCrmLead:async(_ref,value)=>deliveries.push(value.serializedBody),console};
    vm.createContext(context);vm.runInContext(source.slice(start,end),context);
    await context.createCrmLeadDelivery('stable-id',lead,'2026-09-11T11:00:00Z');
    const initial=JSON.stringify(stored);
    context.process.env.CANVAS_NOTIFICATION_OWNER='crm';
    await context.createCrmLeadDelivery('stable-id',{...lead,name:'Changed visitor',communications:policy.capture(config,new Date('2026-09-12'))},'2026-09-12');
    assert.equal(JSON.stringify(stored),initial);assert.equal(stored.idempotencyKey,'canvas-lead:stable-id');assert.equal(deliveries[0],deliveries[1]);
    assert.equal(JSON.parse(stored.serializedBody).capturedAt,lead.communications.capturedAt);
    assert.equal(JSON.parse(stored.serializedBody).testSuppressed,true);
});
test('HTTP retries reuse exact bytes and idempotency header',async()=>{
    const mapping=adapter.buildRequestMapping('stable-id',lead,now.toISOString(),config);const calls=[];
    const options={baseUrl:'https://crm.example.invalid',tenantSlug:'fixture',credential:'synthetic',idempotencyKey:adapter.idempotencyKeyFor('stable-id'),serializedBody:mapping.serializedBody,fetchImpl:async(_url,request)=>{calls.push(request);return {status:503,text:async()=>'{"code":"internal_error"}'};}};
    await adapter.postSerializedDelivery(options);await adapter.postSerializedDelivery(options);
    assert.equal(calls[0].body,calls[1].body);assert.deepEqual(calls[0].headers,calls[1].headers);
});

test('contract bundle is pinned to canonical source and immutable fingerprint',()=>{
 const crypto=require('node:crypto');const manifest=require('./fixtures/crm-contract-source/manifest.json');
 assert.equal(manifest.canonicalSha,'ebed548e67fe493117f1cf5cc10fac371f7d84c1');
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(require.resolve('./fixtures/crm-contract-ebed548.cjs'))).digest('hex'),manifest.bundleSha256);
 for(const [file,hash] of Object.entries(manifest.sourceSha256)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(require('node:path').join(__dirname,'fixtures/crm-contract-source',require('node:path').basename(file)))).digest('hex'),hash);
});
