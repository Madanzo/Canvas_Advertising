'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const policy = require('../communications-policy');
const mapping = require('../crm-lead-adapter');
const now = new Date('2026-09-11T00:00:00Z');
const ready = {owner:'crm',ownedPurposes:['lead_received'], transitionId:'transition_fixture', cutoverAt:'2026-09-10T00:00:00Z', ...Object.fromEntries(policy.GATES.map(k=>[k,true]))};
test('default website; CRM transition requires every gate, valid epoch, and cutoff',()=>{
    assert.equal(policy.capture(policy.configFromEnv({}),now).notificationOwner,'website');
    assert.equal(policy.capture(ready,now).notificationOwner,'crm');
    for(const key of policy.GATES) assert.equal(policy.capture({...ready,[key]:false},now).notificationOwner,'website');
    for(const config of [{...ready,transitionId:''},{...ready,cutoverAt:'invalid'},{...ready,cutoverAt:'2027-01-01'}]) assert.equal(policy.capture(config,now).notificationOwner,'website');
});
test('immutable owner survives rollback; no historical ownership promotion; test suppression persists',()=>{
    const crm=policy.capture(ready,now),website=policy.capture({owner:'website'},now);
    assert.equal(policy.websiteAllowed({owner:'website'},{communications:crm},'lead_received'),false);
    assert.equal(policy.websiteAllowed({owner:'website'},{communications:website},'lead_received'),true);
    assert.equal(policy.websiteAllowed({owner:'website',websitePaused:true},{communications:website},'lead_received'),false);
    assert.equal(policy.websiteAllowed(ready,{},'lead_received'),true);
    assert.equal(policy.deliveryHold(ready,undefined),null);
    assert.equal(policy.deliveryHold(ready,website),null);
    assert.equal(policy.deliveryHold({...ready,transitionId:'different_epoch'},crm),'communications-owner-mismatch');
    assert.equal(policy.deliveryHold(ready,crm),null);
    assert.equal(policy.websiteAllowed({owner:'website'},{communications:policy.capture({owner:'website'},now,true)},'lead_received'),false);
});
test('payload exports only server ownership snapshot and retains strict mapped SMS consent',()=>{
    const lead={service:'vinyl_large_format_printing',notificationOwner:'crm', productionRequest:{version:1,smsConsent:'true'}};
    assert.equal(mapping.buildRequestMapping('fixture',lead).body.notificationOwner,'website');
    const body=mapping.buildRequestMapping('fixture',{...lead,communications:policy.capture(ready,now,false)},now.toISOString(),ready).body;
    assert.equal(body.notificationOwner,'crm');assert.equal(body.transitionId,ready.transitionId);
    assert.equal(body.testSuppressed,false);assert.equal(body.smsConsent,false);
});
for(const name of ['sendEmail','sendSMS']) test(name+' actual helper blocks CRM, held, test, missing-contact before provider access',async()=>{
    const source=fs.readFileSync(require.resolve('../index'),'utf8');
    const start=source.indexOf('async function '+name+'('),end=source.indexOf('\n}',start)+2;
    for(const lead of [{communications:policy.capture(ready,now)},{communications:{notificationOwner:'held'}},{crmIntegrationTestAuthorized:true},null]) {
        let calls=0;
        const context={communicationsPolicy:policy,process:{env:{}},db:{collection(){return{doc(){return{get:async()=>({exists:!!lead,data:()=>lead})}}}}},getPlivo(){calls++;throw Error('must not call')},getResend(){calls++;throw Error('must not call')},console};
        vm.createContext(context);vm.runInContext(source.slice(start,end),context);
        assert.equal((await context[name]({to:'fixture',options:{contactId:'fixture',purpose:'lead_received'}})).error,'website_communications_suppressed');
        assert.equal((await context[name]({to:'fixture'})).error,'communications_contact_required');assert.equal(calls,0);
    }
});

test('new adapter refuses overlapping legacy forwarding',()=>{
    assert.equal(mapping.readiness({enabled:true,legacyForwardingEnabled:true},'fixture').reason,'legacy-forwarding-must-remain-disabled');
});

test('adapter consent matches live SMS safeguard for malformed and unsupported production schema',()=>{
    for (const productionRequest of [{version:2,smsConsent:true},{smsConsent:true},'invalid',null]) {
        assert.equal(mapping.buildRequestMapping('fixture',{service:'other',productionRequest,boatSurvey:{smsConsent:true}}).body.smsConsent,false);
    }
});
