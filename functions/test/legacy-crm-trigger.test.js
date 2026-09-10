"use strict";
const test=require('node:test'), assert=require('node:assert/strict');
const {createLegacyLeadHandler,runtimeHandler}=require('../legacy-crm-trigger');
const forbidden=()=>{throw Error('must not access configuration, record or network');};
for(const value of [undefined,false,'false','true',0]) test(`disabled/non-boolean ${value}: no configuration, snapshot or fetch access`,async()=>{
    const handler=createLegacyLeadHandler({enabled:()=>value,configuration:forbidden,fetch:forbidden});
    assert.equal(await handler({data:forbidden},null),null);
});
for(const flags of [{},{CRM_LEAD_ADAPTER_ENABLED:'false',CRM_LEGACY_FORWARDING_ENABLED:'true'},{CRM_LEAD_ADAPTER_ENABLED:'true'},{CRM_LEAD_ADAPTER_ENABLED:'true',CRM_LEGACY_FORWARDING_ENABLED:'false'}]) test('runtime gate fails closed '+JSON.stringify(flags),async()=>{
    const env=new Proxy(flags,{get:(obj,key)=>key==='CRM_API_URL'||key==='CRM_API_KEY'?forbidden():obj[key]});
    assert.equal(await runtimeHandler(env,forbidden)({data:forbidden},null),null);
});
test('enabled mock preserves legacy event contract; no real network',async()=>{
    let sent;
    const handler=createLegacyLeadHandler({enabled:()=>true,configuration:()=>({url:'https://crm.example.invalid',apiKey:'mock'}),fetch:async(url,args)=>{sent={url,...args};return {ok:true};},logger:{log(){},error(){}}});
    await handler({data:()=>({name:'Synthetic'})},{params:{leadId:'local_test'}});
    assert.equal(JSON.parse(sent.body).id,'local_test');
    assert.equal(JSON.parse(sent.body).eventType,'lead.created');
    assert.equal(sent.headers.Authorization,'Bearer mock');
});
test('enabled without destination does not read lead or call provider',async()=>{
    await createLegacyLeadHandler({enabled:()=>true,configuration:()=>({}),fetch:forbidden})({data:forbidden},null);
});
