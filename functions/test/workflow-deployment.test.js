'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {validate,run,lock}=require('../../tools/check-workflow-deployment.cjs');
const key='CANVAS_WORKFLOW_ELIGIBLE_FROM';
const setup=()=>({candidate:`${key}=${lock.eligibleFrom}\n`,functions:lock.existingTargets.map(n=>({name:`projects/${lock.project}/locations/${lock.region}/functions/${n}`,environmentVariables:{[key]:lock.eligibleFrom}})),leads:[],instances:[]});
test('deployment requires one stable timestamp across candidate and all existing targets',()=>{
 assert.equal(validate(setup()).eligibleFrom,lock.eligibleFrom);
 for(const value of ['', 'tomorrow','2026-02-30T00:00:00.000Z','2027-01-01T00:00:00.000Z']){
  const a=setup();a.candidate=`${key}=${value}`;assert.throws(()=>validate(a));
  const b=setup();b.functions[0].environmentVariables[key]=value;assert.throws(()=>validate(b));
 }
 const missing=setup();missing.functions.pop();assert.throws(()=>validate(missing),/baseline_missing/);
 const duplicate=setup();duplicate.candidate+=duplicate.candidate;assert.throws(()=>validate(duplicate),/duplicate/);
});
test('every existing grant is preserved or deployment refuses, including inactive work',()=>{
 for(const group of ['leads','instances']) for(const stamp of ['2026-01-01T00:00:00.000Z',null,lock.eligibleFrom]){
  const a=setup();const grant={version:1,cutoverAt:stamp};a[group]=[group==='leads'?{communications:{workflowEligibility:grant}}:{status:'cancelled',communicationEligibility:grant}];
  if(stamp===lock.eligibleFrom)assert.doesNotThrow(()=>validate(a));else assert.throws(()=>validate(a));
 }
 const a=setup();a.leads=[{}];a.instances=[{status:'active'}];const before=JSON.stringify(a);validate(a);assert.equal(JSON.stringify(a),before);
});
test('read-only gate paginates and rejects a mismatched grant on the final page',async()=>{
 let calls=0;const a=setup();
 const get=async url=>{calls++; if(url.includes('cloudfunctions'))return{functions:a.functions};if(url.includes('canvas_leads'))return{};if(!url.includes('pageToken'))return{documents:[],nextPageToken:'last'};return{documents:[{fields:{communicationEligibility:{mapValue:{fields:{version:{integerValue:'1'},cutoverAt:{stringValue:'2020-01-01T00:00:00.000Z'}}}}}}]};};
 await assert.rejects(run(get,a.candidate),/eligibility_changed/);assert.equal(calls,4);
 await assert.rejects(run(async()=>{throw Error('permission_denied')},a.candidate),/permission_denied/);
});
