// READ-ONLY post-approval verification, never a deployment or credential operation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const g=require('./hosting-artifact-guard.cjs');
function assertUnavailableStatus(status){assert.ok([403,404,410].includes(status),'Metadata must be unavailable; redirects and HTTP200/SPA fallbacks FAIL: '+status);}
async function verify(dir){
 require('./verify-hosting-package.cjs').verify(dir);
 const id=JSON.parse(fs.readFileSync(path.join(dir,'identity.json'))),expected=JSON.parse(fs.readFileSync(path.join(dir,'served-map.json')));
 const h=require('/Users/camiloreyna/Antigravity Projects/Canvas_Advertising/scratch/app-check-client-2bf92bc/inspect.cjs');await h.init();
 const live=await h.api.getChannel(id.project,id.site,'live'),version=live.release.version.name,files=await h.files(version),actual=Object.fromEntries(files.map(f=>[f.path,f.hash]));
 g.assertSafeManifest(actual);assert.deepEqual(actual,expected,'Actual deployed full map does not match approved package');
 const config=(await h.client.get(version)).body.config;assert.equal(g.sha256(g.canonical(config)),id.configurationSha256,'Actual configuration changed');
 const checks=[];
 for(const host of ['https://canvas-advertising.com','https://canvas-adnvertising.web.app']){
  for(const p of ['/.git/HEAD','/.git/config','/.git/index','/%2egit/HEAD','/.agents/AGENTS.md','/.codex/config.toml'])for(const suffix of ['', '?canvas_containment_verify='+Date.now()]){
   const r=await fetch(host+p+suffix,{method:'HEAD',redirect:'manual',headers:{'Cache-Control':'no-cache'}});checks.push({url:host+p+suffix,status:r.status,cacheControl:r.headers.get('cache-control'),age:r.headers.get('age'),edgeCache:r.headers.get('cf-cache-status')});assertUnavailableStatus(r.status);
  }
  for(const p of ['/','/index-es','/large-format-printing-austin','/large-format-printing-austin-es','/robots.txt','/sitemap.xml','/images/logo.png','/css/styles.20260727.min.css','/projects/tech-center-signage']){
   const r=await fetch(host+p,{redirect:'follow',headers:{'Cache-Control':'no-cache'}});assert.equal(r.status,200,'Ordinary public URL failed: '+host+p);checks.push({url:host+p,status:r.status,finalUrl:r.url});await r.body?.cancel();
  }
 }
 return {version,package:id.packageId,checks,metadataUnavailable:true,fullMapAndConfigurationMatch:true,oldVersionsPurged:false,priorAccessErased:false};
}
module.exports={assertUnavailableStatus,verify};
if(require.main===module){assert.equal(process.argv[2],'--approved-verification','Explicit --approved-verification and package path required; no live verification is implicit');verify(process.argv[3]).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exit(1);});}
