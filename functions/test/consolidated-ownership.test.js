'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const p=require('../communications-policy'),recovery=require('../receipt-recovery');
const source=fs.readFileSync(require.resolve('../index'),'utf8');
const cfg={owner:'crm',ownedPurposes:['lead_received'],workflowEligibleFrom:'2026-01-01T00:00:00Z',cutoverAt:'2026-01-01T00:00:00Z',transitionId:'consolidated_epoch',...Object.fromEntries(p.GATES.map(k=>[k,true]))};
const env={CANVAS_WORKFLOW_ELIGIBLE_FROM:cfg.workflowEligibleFrom};
const lead={communications:p.capture(cfg,new Date('2026-09-10T00:00:00Z')),phone:'+15125550123',productionRequest:{version:1,smsConsent:false}};
const fn=n=>{const a=source.indexOf('async function '+n+'(');return source.slice(a,source.indexOf('\n}',a)+2)};
function worker(record,instance,step){let providers=0;const writes=[],logs=[];
 const c={communicationsPolicy:p,smsConsent:require('../sms-consent'),process:{env:{...env}},console:{log(){},error:(...v)=>logs.push(v)},db:{collection:n=>({doc:()=>({get:async()=>({exists:true,data:()=>n==='canvas_workflows'?{trigger:'form_submit',steps:[step]}:record}),update:async v=>writes.push(v)})})},admin:{firestore:{FieldValue:{serverTimestamp:()=>0,arrayUnion:x=>x}}},sendEmail:async()=>{providers++;return{success:true}},sendSMS:async()=>{providers++;return{success:true}}};
 vm.createContext(c);vm.runInContext(fn('processInstance')+'\n'+fn('executeWorkflowStep'),c);
 return {run:()=>c.processInstance({id:'mock-instance',data:()=>instance}),writes,logs,count:()=>providers};}
test('actual worker refuses historical active/due records unchanged, even after owner rollback',async()=>{
 for(const record of [{}, {communications:{communicationPolicyVersion:1,notificationOwner:'website',capturedAt:'2020-01-01T00:00:00Z'}},lead]){
  const instance={contactId:'fixture',currentStepIndex:0,status:'active',nextExecutionAt:1};const before=JSON.stringify(instance);
  const h=worker(record,instance,{type:'email',templateId:'welcome'});await h.run();assert.equal(h.count(),0);assert.deepEqual(h.writes,[]);assert.equal(JSON.stringify(instance),before);assert.match(JSON.stringify(h.logs),/workflow_not_authorized/);
 }
});
test('eligible post-cutover followup advances; unknown mapping refuses observably without consuming job',async()=>{
 const instance={contactId:'fixture',currentStepIndex:0,communicationEligibility:p.workflowGrant(cfg,lead)};
 const allowed=worker(lead,instance,{type:'email',templateId:'follow_up_no_response'});await allowed.run();assert.equal(allowed.count(),1);assert.equal(allowed.writes[0].status,'completed');
 const unknown=worker(lead,instance,{type:'email',templateId:'unreviewed_followup',purpose:'follow_up'});await unknown.run();assert.equal(unknown.count(),0);assert.equal(unknown.writes.length,0);assert.match(JSON.stringify(unknown.logs),/unknown_communication_purpose/);
});
test('eligible SMS grant does not override current opt-out; no provider call',async()=>{
 const instance={contactId:'fixture',contactPhone:lead.phone,currentStepIndex:0,communicationEligibility:p.workflowGrant(cfg,lead),smsEnrollment:{authorized:true,phone:lead.phone}};
 const h=worker({...lead,communications:{...lead.communications,notificationOwner:'website'}},instance,{type:'sms',templateId:'sms_welcome'});await h.run();assert.equal(h.count(),0);assert.equal(h.writes[0].history.result.reason,'sms_consent_required');
});
test('configuration loss cannot mint eligibility later or reassign original CRM receipt',()=>{
 const captured=p.capture({},new Date('2026-09-10T00:00:00Z'));assert.equal(p.workflowGrant(cfg,{communications:captured}),null);
 assert.equal(p.dispatchDecision({},lead,{communicationEligibility:p.workflowGrant(cfg,lead)},'follow_up').allowed,false);
 assert.equal(p.websiteAllowed({},lead,'lead_received'),false);
});
test('review planner needs authenticated exact-ID approval, retains identity and cannot authorize a send',()=>{
 const obligation={...lead,receiptObligation:{owner:'crm',status:'unresolved',capturedAt:lead.communications.capturedAt,transitionId:cfg.transitionId}};
 const delivery={leadId:'fixture',idempotencyKey:'canvas-lead:fixture',serializedBody:'{"original":true}'};
 for(const authority of [null,{authenticated:true,role:'visitor'}, {authenticated:true,role:'communications_reviewer',leadId:'other',approvalId:'a'}])assert.equal(recovery.planReview({leadId:'fixture',lead:obligation,delivery,authority}).allowed,false);
 const args={leadId:'fixture',lead:obligation,delivery,authority:{authenticated:true,role:'communications_reviewer',actorId:'operator',leadId:'fixture',approvalId:'explicit-review'}};
 const first=recovery.planReview(args);assert.equal(first.maySend,false);assert.deepEqual(recovery.planReview(args),first);assert.equal(first.idempotencyKey,delivery.idempotencyKey);
 assert.equal(recovery.planReview({...args,delivery:null}).reason,'original_delivery_missing_manual_review');
 assert.equal(recovery.planReview({...args,lead:{...obligation,communications:{...lead.communications,testSuppressed:true}}}).allowed,false);
});
test('real direct callback rejects unauthenticated input before any helper call',async()=>{
 let callback,providers=0;const c={exports:{},configuredFunctions:{https:{onCall:f=>(callback=f)}},functions:{https:{HttpsError:Error}},sendEmail:()=>{providers++},sendSMS:()=>{providers++},console};
 const a=source.indexOf('exports.sendDirectMessage ='),b=source.indexOf('\n});',a)+4;vm.createContext(c);vm.runInContext(source.slice(a,b),c);
 await assert.rejects(callback({type:'email',purpose:'direct_message'},{auth:null}));assert.equal(providers,0);
});
test('consolidated mapping survives reordered known steps and covers saved booking/project additions',()=>{
 assert.equal(p.stepPurpose('form_submit',{type:'email',templateId:'follow_up_no_response',purpose:'lead_received'},'wf_welcome',0),'follow_up');
 assert.equal(p.stepPurpose('form_submit',{type:'email',templateId:'welcome',purpose:'follow_up'},'wf_welcome',2),'lead_received');
 assert.equal(p.stepPurpose('booking',{type:'email',templateId:'booking_reminder_2h'}),'reminder');
 assert.equal(p.stepPurpose('status_change',{type:'email',templateId:'thank_you_post_project'}),'project_completion');
 assert.equal(p.stepPurpose('status_change',{type:'sms',templateId:'sms_thank_you'}),'project_completion');
 assert.equal(p.stepPurpose('form_submit',{type:'email',purpose:'follow_up'}),undefined);
});

test('no-step completion refuses an ineligible instance without writes or provider calls',async()=>{
 for(const record of [{},lead]) {
  const instance={contactId:'fixture',workflowId:'empty',status:'active',currentStepIndex:0,nextExecutionAt:1,history:[]};
  const before=JSON.stringify(instance);const h=worker(record,instance,undefined);
  await h.run();assert.equal(h.count(),0);assert.deepEqual(h.writes,[]);
  assert.equal(JSON.stringify(instance),before);assert.match(JSON.stringify(h.logs),/communication_refused.*workflow_not_authorized/);
 }
 const instance={contactId:'fixture',workflowId:'empty',currentStepIndex:0,communicationEligibility:p.workflowGrant(cfg,lead)};
 const allowed=worker(lead,instance,undefined);await allowed.run();assert.equal(allowed.count(),0);assert.equal(allowed.writes[0].status,'completed');
});
