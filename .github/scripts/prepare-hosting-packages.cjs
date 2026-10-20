// Read-only live capture + local package preparation. There is NO remote-write API.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const g=require('./hosting-artifact-guard.cjs');
const allow=['/index.html','/index-es.html','/large-format-printing-austin.html','/large-format-printing-austin-es.html'].sort();
async function prepare(source){
 const read=f=>cp.execFileSync('git',['show',source+':'+f]);
 const helper=require('/Users/camiloreyna/Antigravity Projects/Canvas_Advertising/scratch/app-check-client-2bf92bc/inspect.cjs');
 await helper.init();const live=await helper.api.getChannel('canvas-adnvertising','canvas-adnvertising','live');
 const version=live.release.version.name;assert.ok(version.startsWith('projects/canvas-adnvertising/sites/canvas-adnvertising/versions/'));
 const config=(await helper.client.get(version)).body.config,files=await helper.files(version),before=Object.fromEntries(files.map(f=>[f.path,f.hash]).sort(([a],[b])=>a.localeCompare(b)));
 assert.equal(files.length,Object.keys(before).length,'Duplicate live path');
 const {map:sanitized,omitted}=g.sanitizeManifest(before),records=JSON.parse(read('release-evidence/corrected-source/artifacts.json')).records;
 const previous=JSON.parse(read('release-evidence/technical-package.json'));
 assert.deepEqual(records.map(r=>r.path).sort(),allow);
 const seo={...sanitized};for(const r of records){assert.ok(Object.hasOwn(seo,r.path));assert.equal(before[r.path],previous.changed.find(c=>c.path===r.path).beforeHostingHash,'Public source baseline drift: reconcile before replacing '+r.path);seo[r.path]=r.gzipSha256;}
 g.assertTransition(before,sanitized,{omitted,configBefore:config,configAfter:config});
 g.assertTransition(sanitized,seo,{replacements:Object.fromEntries(records.map(r=>[r.path,r.gzipSha256])),configBefore:config,configAfter:config});
 const root=fs.mkdtempSync('/private/tmp/canvas-hosting-approval-'),capturedAt=new Date().toISOString(),sanitizedHash=g.sha256(g.canonical(sanitized)),configHash=g.sha256(g.canonical(config));
 fs.writeFileSync(root+'/capture.json',JSON.stringify({project:'canvas-adnvertising',site:'canvas-adnvertising',version,capturedAt,configuration:config,manifest:before},null,2)+'\n');
 const artifacts=[];
 for(const [kind,base,map,drops,uploads]of [['containment',before,sanitized,omitted,[]],['seo-after-containment',sanitized,seo,[],records],['containment-preserving-fallback',seo,sanitized,[],[]]]){
  const dir=path.join(root,kind);fs.mkdirSync(dir,{recursive:true});
  for(const file of ['hosting-artifact-guard.cjs','verify-hosting-package.cjs'])fs.writeFileSync(path.join(dir,file),read('.github/scripts/'+file));
  for(const r of uploads){const file=r.path.slice(1);fs.mkdirSync(dir+'/source',{recursive:true});fs.mkdirSync(dir+'/upload',{recursive:true});fs.writeFileSync(dir+'/source/'+file,read(file));fs.writeFileSync(dir+'/upload/'+file+'.gz',read('release-evidence/corrected-source/'+file+'.gz'));}
  const replacementHashes=Object.fromEntries(Object.entries(map).filter(([p,h])=>base[p]!==h));
  g.assertTransition(base,map,{omitted:drops,replacements:replacementHashes,configBefore:config,configAfter:config});
  const id={project:'canvas-adnvertising',site:'canvas-adnvertising',kind,source,capturedAt,observedLiveVersion:version,baselineRequirement:kind==='containment'?'Exact captured current live version/map/config; stop on drift':kind==='seo-after-containment'?'Verified SANITIZED baseline map/config; version ID assigned only after separately approved containment':'Exact reviewed sanitized SEO map/config; four public hash reversions to sanitized prior-public-content baseline, never the exposed historical version',beforeMapSha256:g.sha256(g.canonical(base)),servedMapSha256:g.sha256(g.canonical(map)),sanitizedBaselineSha256:sanitizedHash,configurationSha256:configHash,guardSha256:g.sha256(read('.github/scripts/hosting-artifact-guard.cjs')),verifierSha256:g.sha256(read('.github/scripts/verify-hosting-package.cjs')),counts:{filesBefore:Object.keys(base).length,filesAfter:Object.keys(map).length,omissions:drops.length,replacements:Object.keys(replacementHashes).length,unchanged:Object.keys(map).length-Object.keys(replacementHashes).length,additions:0},omittedPaths:drops,replacementHashes,uploads,preservedDynamicRewrites:config.rewrites,fallback:{kind:'New version from containment-preserving fallback artifact, NOT observed historical version',servedMapSha256:sanitizedHash,versionId:null,unsafeVersionAllowed:false},status:'PREPARED_NO_REMOTE_WRITES'};
  id.packageId='canvas-'+kind+'-'+g.sha256(g.canonical({source,map:id.servedMapSha256,before:id.beforeMapSha256,config:configHash,guard:id.guardSha256}));
  for(const [file,data]of Object.entries({'before-map.json':base,'served-map.json':map,'hosting-config.json':config,'identity.json':id}))fs.writeFileSync(path.join(dir,file),JSON.stringify(data,null,2)+'\n');
  const verifier=require(path.join(dir,'verify-hosting-package.cjs'));const verification=verifier.verify(dir);fs.writeFileSync(dir+'/verification.json',JSON.stringify(verification,null,2)+'\n');
  artifacts.push({directory:dir,...verification,packageId:id.packageId,identitySha256:g.sha256(fs.readFileSync(dir+'/identity.json')),guardSha256:id.guardSha256,verifierSha256:id.verifierSha256});
 }
 assert.equal((await helper.api.getChannel('canvas-adnvertising','canvas-adnvertising','live')).release.version.name,version,'Live changed during capture; stop');
 const summary={root,source,project:'canvas-adnvertising',site:'canvas-adnvertising',capturedAt,observedLiveVersion:version,exposedHistoricalVersionNotSafeForRollback:version,liveMapSha256:g.sha256(g.canonical(before)),sanitizedMapSha256:sanitizedHash,configurationSha256:configHash,omittedMetadataCount:omitted.length,omittedInventorySha256:g.sha256(g.canonical(omitted)),metadataCategories:{git:omitted.filter(p=>p.startsWith('/.git/')).length,other:omitted.filter(p=>!p.startsWith('/.git/'))},artifacts};
 fs.writeFileSync(root+'/approval-summary.json',JSON.stringify(summary,null,2)+'\n');fs.writeFileSync('/private/tmp/canvas-hosting-approval-location.json',JSON.stringify({root},null,2)+'\n');console.log(JSON.stringify(summary,null,2));
 return summary;
}
module.exports={prepare};if(require.main===module)prepare(process.argv[2]||cp.execFileSync('git',['rev-parse','HEAD']).toString().trim()).catch(e=>{console.error(e);process.exit(1);});
