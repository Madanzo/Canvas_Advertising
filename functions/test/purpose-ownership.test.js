'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const policy=require('../communications-policy'),sms=require('../sms-consent'),adapter=require('../crm-lead-adapter');
const source=fs.readFileSync(require.resolve('../index'),'utf8');
const cfg={workflowEligibleFrom:'2026-09-01T00:00:00Z',owner:'crm',ownedPurposes:['lead_received'],transitionId:'purpose_fixture_epoch',cutoverAt:'2026-09-01T00:00:00Z',...Object.fromEntries(policy.GATES.map(k=>[k,true]))};
const env={CANVAS_WORKFLOW_ELIGIBLE_FROM:cfg.workflowEligibleFrom,CANVAS_CRM_OWNED_PURPOSES:'["lead_received"]',CANVAS_COMMUNICATIONS_TRANSITION_ID:cfg.transitionId,CANVAS_COMMUNICATIONS_CUTOVER_AT:cfg.cutoverAt,...Object.fromEntries(policy.GATES.map(k=>['CRM_COMMUNICATIONS_'+k.replace(/[A-Z]/g,c=>'_'+c).toUpperCase(),'true']))};
const lead={name:'Synthetic',email:'fixture@example.invalid',phone:'+15125550123',service:'other',productionRequest:{version:1,smsConsent:true},communications:policy.capture(cfg,new Date('2026-09-10T10:00:00Z'))};
const fn=name=>{const a=source.indexOf('async function '+name+'(');return source.slice(a,source.indexOf('\n}',a)+2);};
function harness(record=lead,workflow={enabled:true,trigger:'form_submit',steps:[{type:'email',templateId:'welcome'},{type:'sms',templateId:'sms_welcome'},{type:'email',templateId:'follow_up_no_response',delay:2,unit:'days'}]}) {
 const writes=[],sends=[];const db={collection(name){return {doc(){return {get:async()=>({exists:true,data:()=>name==='canvas_workflows'?workflow:record}),update:async data=>writes.push(data)};},add:async data=>writes.push(data)};}};
 const c={communicationsPolicy:policy,smsConsent:sms,process:{env:{...env}},db,console:{log(){},error(){}},admin:{firestore:{FieldValue:{serverTimestamp:()=>0,arrayUnion:x=>x},Timestamp:{fromMillis:x=>x}}},sendEmail:async x=>{sends.push(x);return {success:true};},sendSMS:async x=>{sends.push(x);return {success:true};}};
 vm.createContext(c);vm.runInContext([fn('enrollContactInWorkflow'),fn('executeWorkflowStep'),fn('processInstance')].join('\n'),c);return {c,writes,sends,workflow};
}
test('defaults, obsolete global flag and invalid purpose configuration cannot transfer ownership',()=>{
 for(const value of [undefined,'','crm','null','{}','["booking"]','["lead_received","booking"]','["lead_received","lead_received"]']) {
  const c=policy.configFromEnv({...env,CANVAS_NOTIFICATION_OWNER:'crm',CANVAS_CRM_OWNED_PURPOSES:value});assert.equal(policy.ready(c),false);
  const stamp=policy.capture(c,new Date('2026-09-10'));assert.equal(stamp.notificationOwner,'website');assert.equal(policy.websiteAllowed(c,{communications:stamp},'lead_received'),true);
 }
 for(const value of ['0','2026-02-31T00:00:00Z','not-a-date'])assert.equal(policy.capture({...cfg,cutoverAt:value},new Date('2026-09-10')).notificationOwner,'website');
 for(const gate of policy.GATES){const c={...cfg,[gate]:false};assert.equal(policy.capture(c,new Date('2026-09-10')).notificationOwner,'website');}
});
test('one original owner for lead_received; unrelated purposes stay website-owned across rollback',()=>{
 assert.equal(policy.websiteAllowed(cfg,lead,'lead_received'),false);
 assert.equal(adapter.buildRequestMapping('fixture',lead,undefined,cfg).body.notificationOwner,'crm');
 for(const purpose of policy.PURPOSES.filter(x=>x!=='lead_received'))assert.equal(policy.websiteAllowed(cfg,lead,purpose),true);
 const rollback=policy.configFromEnv({});assert.equal(policy.websiteAllowed(rollback,lead,'lead_received'),false);
 assert.equal(policy.deliveryHold(rollback,lead.communications),'communications-owner-mismatch');
 const historic={...lead,communications:undefined};assert.equal(adapter.buildRequestMapping('old',historic,undefined,cfg).body.testSuppressed,true);assert.equal(policy.websiteAllowed(cfg,historic,'lead_received'),true);
 assert.equal(policy.websiteAllowed(cfg,lead,undefined),false);
 assert.equal(policy.stepPurpose('form_submit',{type:'task'}),'workflow');
 assert.equal(policy.stepPurpose('untrusted',{type:'email',templateId:'welcome'}),undefined);
});
test('mixed welcome enrollment retains follow-up; initial receipt steps skip without blocking later steps',async()=>{
 const h=harness();await h.c.enrollContactInWorkflow('fixture','wf_welcome',lead,'form_submit');const instance=h.writes[0];assert.equal(instance.communicationOrigin,'form_submit');
 for(const step of h.workflow.steps)await h.c.executeWorkflowStep(step,instance,policy.stepPurpose('form_submit',step));
 assert.equal(h.sends.length,1);assert.equal(h.sends[0].options.purpose,'follow_up');assert.equal(h.sends[0].templateId,'follow_up_no_response');
});
test('receipt-only enrollment suppressed; same workflow invoked by campaign retains consent checks',async()=>{
 const wf={enabled:true,trigger:'form_submit',steps:[{type:'sms',templateId:'sms_welcome'}]};const h=harness(lead,wf);
 await h.c.enrollContactInWorkflow('fixture','receipt',lead,'form_submit');assert.equal(h.writes.length,0);
 await h.c.enrollContactInWorkflow('fixture','receipt',{...lead,communicationOrigin:'form_submit'},'campaign');const instance=h.writes[0];assert.equal(instance.communicationOrigin,'campaign');
 await h.c.executeWorkflowStep(wf.steps[0],instance,policy.stepPurpose(instance.communicationOrigin,wf.steps[0]));assert.equal(h.sends.length,1);assert.equal(h.sends[0].options.purpose,'campaign');
 const denied=harness({...lead,productionRequest:{version:1,smsConsent:false}},wf);await denied.c.enrollContactInWorkflow('fixture','receipt',lead,'campaign');assert.equal(denied.writes.length,0);
});
test('booking and reminder steps retain their own ownership and stored SMS grants',async()=>{
 const h=harness(lead,{enabled:true,steps:[{type:'email',templateId:'booking_confirmed'},{type:'sms',templateId:'sms_booking_confirmed',relativeTo:'event'}]});
 await h.c.enrollContactInWorkflow('fixture','wf_booking',lead,'booking');const instance=h.writes[0];
 for(const step of h.workflow.steps)await h.c.executeWorkflowStep(step,instance,policy.stepPurpose('booking',step));
 assert.deepEqual(h.sends.map(x=>x.options.purpose),['booking','reminder']);
});
test('scheduler skips receipt only, retains normal delay, and rollback never rewinds the instance',async()=>{
 const h=harness();const instance={workflowId:'wf_welcome',contactId:'fixture',communicationOrigin:'form_submit',communicationEligibility:policy.workflowGrant(cfg,lead),currentStepIndex:0,contactEmail:lead.email};
 await h.c.processInstance({id:'synthetic',data:()=>instance});const first=h.writes.at(-1);assert.equal(first.currentStepIndex,1);assert.equal(h.sends.length,0);
 h.c.process.env={CANVAS_WORKFLOW_ELIGIBLE_FROM:cfg.workflowEligibleFrom};Object.assign(instance,first);await h.c.processInstance({id:'synthetic',data:()=>instance});const second=h.writes.at(-1);assert.equal(second.currentStepIndex,2);assert.ok(second.nextExecutionAt>=Date.now()+47*60*60*1000);assert.equal(h.sends.length,0);
 assert.equal(h.writes.length,2);
});
test('direct handler hardcodes purpose and shared SMS sender retains explicit consent',async()=>{
 let callback;const seen=[];const c={exports:{},configuredFunctions:{https:{onCall:f=>{callback=f;return f;}}},functions:{https:{HttpsError:Error}},sendEmail:async x=>{seen.push(x);return {success:true};},sendSMS:async x=>{seen.push(x);return {success:true};},console};
 const a=source.indexOf('exports.sendDirectMessage ='),b=source.indexOf('\n});',a)+4;vm.createContext(c);vm.runInContext(source.slice(a,b),c);
 await callback({contactId:'fixture',type:'email',content:'mock',subject:'mock',recipient:lead.email,purpose:'lead_received',notificationOwner:'website'},{auth:{uid:'fixture'}});assert.equal(seen[0].options.purpose,'direct_message');
});
test('actual shared email/SMS helpers suppress receipt and allow other explicit purposes with consent',async()=>{
 for(const name of ['sendEmail','sendSMS'])for(const purpose of ['lead_received','follow_up','booking','reminder','campaign','direct_message',undefined]){
  let sent=0;const grant=sms.enrollment({steps:[{type:'sms'}]},lead,lead.phone).smsEnrollment;
  const c={communicationsPolicy:policy,smsConsent:sms,process:{env:{...env,PLIVO_PHONE_NUMBER:'synthetic'}},db:{collection:name=>({doc:()=>({get:async()=>({exists:true,data:()=>name==='workflowContacts'?{communicationEligibility:policy.workflowGrant(cfg,lead)}:lead})})})},console:{log(){},warn(){},error(){}},getResend:()=>({emails:{send:async()=>{sent++;return{id:'mock'};}}}),getPlivo:()=>({messages:{create:async()=>{sent++;return{messageUuid:['mock']};}}}),logCommunication:async()=>{},admin:{firestore:{FieldValue:{serverTimestamp:()=>0}}}};
  vm.createContext(c);vm.runInContext(fn(name),c);
  await c[name]({to: name==='sendSMS'?lead.phone:lead.email,options:{purpose,workflowInstanceId:'fixture-instance',contactId:'fixture',workflowId:purpose==='direct_message'?'direct_message':'fixture',smsEnrollment:grant,subject:'Mock',html:'Mock',text:'Mock'}});
  assert.equal(sent,purpose && purpose!=='lead_received'?1:0,name+':'+purpose);
 }
});
test('public capture purpose overrides visitor booking source; arbitrary step purpose cannot bypass receipt suppression',async()=>{
 let callback;const origins=[],filters=[];const c={exports:{},configuredFunctions:{firestore:{document:()=>({onCreate:f=>{callback=f;return f;}})}},communicationsPolicy:policy,process:{env},crmLeadAdapter:{isSyntheticTestSubmission:()=>false},crmLeadAdapterConfig:()=>({}),console:{log(){}},enrollContactInWorkflow:async(_id,_wf,_lead,origin)=>origins.push(origin),db:{collection:()=>{const q={where:(...args)=>{filters.push(args);return q;},get:async()=>({empty:false,forEach:f=>f({id:'wf_welcome'})})};return q;}}};
 const a=source.indexOf('exports.onNewLead ='),b=source.indexOf('\n    });',a)+7;vm.createContext(c);vm.runInContext(source.slice(a,b),c);
 await callback({data:()=>({...lead,source:'booking'})},{params:{leadId:'synthetic'}});assert.deepEqual(origins,['form_submit']);assert.equal(filters[0][2],'form_submit');
 assert.equal(policy.stepPurpose('form_submit',{type:'email',templateId:'welcome',purpose:'booking',notificationOwner:'website'}),'lead_received');
});
