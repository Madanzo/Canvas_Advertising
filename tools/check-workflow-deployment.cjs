'use strict';
// Read-only deployment gate. Never provisions credentials or writes production state.
const fs = require('node:fs');
const path = require('node:path');
const lock = require('../deployment/workflow-eligibility.json');
const KEY = 'CANVAS_WORKFLOW_ELIGIBLE_FROM';
function timestamp(v) {
  return typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v)
    && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
}
function checkValue(value, where) {
  if (!value) throw Error(`eligibility_missing:${where}`);
  if (!timestamp(value)) throw Error(`eligibility_malformed:${where}`);
  if (value !== lock.eligibleFrom) throw Error(`eligibility_changed:${where}`);
}
function candidateValue(source) {
  // Only the reviewed project-specific dotenv file supplies this key; no shell fallback.
  const entries = source.split(/\r?\n/).filter(l => l.trim() && !l.trim().startsWith('#'));
  const values = entries.filter(l => l.startsWith(KEY + '='));
  if (values.length !== 1) throw Error('eligibility_missing_or_duplicate:candidate');
  const value = values[0].slice(KEY.length + 1);
  checkValue(value, 'candidate'); return value;
}
function validate({candidate, functions, leads, instances}) {
  checkValue(lock.eligibleFrom, 'lock'); candidateValue(candidate);
  for (const name of [...lock.existingTargets, ...lock.newTargets]) {
    const f = functions.find(f => f.name === `projects/${lock.project}/locations/${lock.region}/functions/${name}`);
    if (!f && lock.newTargets.includes(name)) continue;
    if (!f) throw Error(`baseline_missing:${name}`);
    // Initial rollout must stage the same value on every existing target first.
    checkValue(f.environmentVariables?.[KEY], name);
  }
  for (const d of leads) {
    const grant = d.communications?.workflowEligibility;
    if (grant !== undefined) {
      if (grant?.version !== 1) throw Error('unsupported_capture_grant');
      checkValue(grant.cutoverAt, 'capture_grant');
    }
  }
  for (const d of instances) {
    if (d.communicationEligibility !== undefined) {
      if (d.communicationEligibility?.version !== 1) throw Error('unsupported_instance_grant');
      checkValue(d.communicationEligibility.cutoverAt, 'instance_grant');
    }
  }
  return {eligibleFrom:lock.eligibleFrom, leadsChecked:leads.length, instancesChecked:instances.length};
}
function decode(v) {
  if (v.mapValue) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k,x])=>[k,decode(x)]));
  if ('integerValue' in v) return Number(v.integerValue);
  return v.stringValue ?? v.booleanValue ?? null;
}
async function collect(get, url) {
  const rows=[]; let token;
  do {
    const page=await get(url + (token ? '&pageToken='+encodeURIComponent(token) : ''));
    rows.push(...(page.documents||[]).map(d=>Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,decode(v)]))));
    token=page.nextPageToken;
  } while(token);
  return rows;
}
async function run(get, candidate) {
  const root=`https://firestore.googleapis.com/v1/projects/${lock.project}/databases/(default)/documents`;
  const functions=[];let token;
  do {
    const page=await get(`https://cloudfunctions.googleapis.com/v1/projects/${lock.project}/locations/${lock.region}/functions?pageSize=1000${token?'&pageToken='+encodeURIComponent(token):''}`);
    if(page.unreachable?.length) throw Error('functions_unreachable');
    functions.push(...(page.functions||[])); token=page.nextPageToken;
  } while(token);
  const leads=await collect(get,root+'/canvas_leads?pageSize=300&mask.fieldPaths=communications.workflowEligibility');
  const instances=await collect(get,root+'/workflowContacts?pageSize=300&mask.fieldPaths=communicationEligibility');
  return validate({candidate,functions,leads,instances});
}
if (require.main === module) (async()=>{
  if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== lock.project) throw Error('wrong_project');
  const dir=path.resolve(process.argv[2] || process.env.RESOURCE_DIR || 'functions');
  const candidate=fs.readFileSync(path.join(dir,'.env.'+lock.project),'utf8');
  candidateValue(candidate);
  // ADC of the already-authorized deployment identity only; no login or key creation.
  const localRequire=require('node:module').createRequire(path.join(dir,'package.json'));
  const {GoogleAuth}=localRequire('google-auth-library');
  const client=await new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform.read-only']}).getClient();
  const result=await run(async url=>(await client.request({url,method:'GET'})).data,candidate);
  console.log(JSON.stringify({deploymentPrecondition:'passed',...result}));
})().catch(e=>{console.error('deployment_precondition_refused', e.message);process.exitCode=1;});
module.exports={validate,candidateValue,run,lock};
