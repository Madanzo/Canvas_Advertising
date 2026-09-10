"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const policy = require('../sms-consent');
const source = fs.readFileSync(process.env.SMS_TEST_INDEX || require.resolve('../index.js'), 'utf8');
function lead(value) { return {phone: '+15125550123', productionRequest:{version:1, ...(value === undefined ? {} : {smsConsent:value})}}; }
function harness(current, grant) {
    const calls = { writes:[], sends:0, reads:0 };
    const workflow = {enabled:true, steps:[{type:'email'}, {type:'sms'}]};
    const db = {collection(name) { return {
        doc() { return {async get() { calls.reads++; return name === 'canvas_workflows' ? {exists:true,data:()=>workflow} : {exists:!!current,data:()=>current}; }, async update(v) { calls.writes.push(v); }}; },
        async add(v) { calls.writes.push(v); }
    }; }};
    const context = {communicationsPolicy:require('../communications-policy'),process:{env:{}},smsConsent:policy, db, console:{log(){},error(){}}, admin:{firestore:{FieldValue:{serverTimestamp:()=> 'timestamp'}}}, sendSMS:async()=>{calls.sends++;return {success:true};},sendEmail:async()=>({success:true})};
    vm.createContext(context);
    const enroll = source.slice(source.indexOf('async function enrollContactInWorkflow('),source.indexOf('/**\n * HTTP Callable: Process Bulk Campaign'));
    const start = source.indexOf('async function executeWorkflowStep(');
    const end = source.indexOf('\n}', start)+2;
    vm.runInContext(enroll + '\n' + source.slice(start,end) + ';this.enroll=enrollContactInWorkflow;this.execute=executeWorkflowStep;',context);
    return {context,calls,workflow,instance:{contactId:'test',contactPhone:'+15125550123',smsEnrollment:grant}};
}
for (const [label,value,expected] of [['opted-in',true,true],['opted-out',false,false],['missing',undefined,false],['string true','true',false]]) {
    test(label + ': enrollment and actual SMS step enforce explicit consent', async()=>{
        const h=harness(lead(value));
        await h.context.enroll('test','welcome',lead(value));
        const instance=h.calls.writes[0];
        assert.equal(instance.smsEnrollment.authorized,expected);
        const result=await h.context.execute({type:'sms'},instance);
        assert.equal(h.calls.sends,expected ? 1 : 0);
        assert.equal(result.skipped === true,!expected);
        h.workflow.steps=[{type:'sms'}]; h.calls.writes=[];
        await h.context.enroll('test','sms-only',lead(value));
        assert.equal(h.calls.writes.length,expected ? 2 : 0);
    });
}
test('send-time revocation, missing lead, missing enrollment, or changed phone deny provider access',async()=>{
    const grant=policy.enrollment({steps:[{type:'sms'}]},lead(true),'+15125550123').smsEnrollment;
    for(const current of [lead(false),lead(undefined),null,{...lead(true),phone:'+15125550999'}]) {
        const h=harness(current,grant);await h.context.execute({type:'sms'},h.instance);assert.equal(h.calls.sends,0);
    }
    const h=harness(lead(true));await h.context.execute({type:'sms'},h.instance);assert.equal(h.calls.sends,0);
});
test('old false enrollment is never retroactively authorized by later opt-in',()=>{
    const grant=policy.enrollment({steps:[{type:'email'},{type:'sms'}]},lead(false),'+15125550123').smsEnrollment;
    assert.equal(policy.canSend({smsEnrollment:grant,contactPhone:'+15125550123'},lead(true)),false);
});
test('versioned quote consent takes precedence over older boat consent; unknown schemas fail closed',()=>{
    assert.equal(policy.explicitConsent({boatSurvey:{smsConsent:true}}),true);
    assert.equal(policy.explicitConsent({...lead(false),boatSurvey:{smsConsent:true}}),false);
    assert.equal(policy.explicitConsent({productionRequest:{version:2,smsConsent:true},boatSurvey:{smsConsent:true}}),false);
    assert.equal(policy.explicitConsent({smsConsent:true}),false);
});

test('shared sender also blocks direct SMS before provider/config access without explicit consent',async()=>{
 const start=source.indexOf('async function sendSMS('), end=source.indexOf('\n}',start)+2;
 for(const value of [true,false,undefined]) {
  let providers=0, sends=0;
  const context={communicationsPolicy:require('../communications-policy'),smsConsent:policy,console:{warn(){},log(){},error(){}},db:{collection:()=>({doc:()=>({get:async()=>({exists:true,data:()=>lead(value)})})})},
   getPlivo:()=>{providers++;return {messages:{create:async()=>{sends++;return {messageUuid:['mock']};}}};},
   process:{env:{PLIVO_PHONE_NUMBER:'mock'}},runtimeConfig:()=>{throw Error('unexpected config');},logCommunication:async()=>{},admin:{firestore:{FieldValue:{serverTimestamp:()=>0}}}};
  vm.createContext(context);vm.runInContext(source.slice(start,end)+';this.send=sendSMS;',context);
  const result=await context.send({to:'+15125550123',options:{contactId:'test',workflowId:'direct_message',text:'Mock only'}});
  assert.equal(result.success,value===true);assert.equal(providers,value===true?1:0);assert.equal(sends,value===true?1:0);
 }
});
