// Offline artifact/API-map guard. No credentials, uploads, deploys or deletions.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),zlib=require('node:zlib');
const g=require('./hosting-artifact-guard.cjs');
function verify(dir){
 const read=f=>JSON.parse(fs.readFileSync(path.join(dir,f))),id=read('identity.json'),before=read('before-map.json'),after=read('served-map.json'),config=read('hosting-config.json');
 assert.equal(id.project,'canvas-adnvertising');assert.equal(id.site,'canvas-adnvertising');
 assert.ok(['containment','seo-after-containment','containment-preserving-fallback'].includes(id.kind));
 const allowed=['/index-es.html','/index.html','/large-format-printing-austin-es.html','/large-format-printing-austin.html'];
 assert.deepEqual(id.uploads.map(u=>u.path).sort(),id.kind==='seo-after-containment'?allowed:[]);
 assert.deepEqual(Object.keys(id.replacementHashes).sort(),id.kind==='containment'?[]:allowed);
 assert.equal(g.sha256(g.canonical(before)),id.beforeMapSha256);assert.equal(g.sha256(g.canonical(after)),id.servedMapSha256);assert.equal(g.sha256(g.canonical(config)),id.configurationSha256);
 assert.equal(g.sha256(fs.readFileSync(path.join(dir,'hosting-artifact-guard.cjs'))),id.guardSha256);
 assert.equal(g.sha256(fs.readFileSync(path.join(dir,'verify-hosting-package.cjs'))),id.verifierSha256);
 g.assertSafeManifest(after);g.assertTransition(before,after,{omitted:id.omittedPaths,replacements:id.replacementHashes,configBefore:config,configAfter:config});
 for(const u of id.uploads){const raw=fs.readFileSync(path.join(dir,'source',u.path.slice(1))),gzip=fs.readFileSync(path.join(dir,'upload',u.path.slice(1)+'.gz'));assert.equal(g.sha256(raw),u.rawSha256);assert.equal(g.sha256(gzip),u.gzipSha256);assert.deepEqual(zlib.gunzipSync(gzip),raw);assert.equal(after[u.path],u.gzipSha256);}
 assert.equal(Object.keys(after).length,id.counts.filesAfter);assert.equal(Object.keys(before).length,id.counts.filesBefore);assert.equal(id.counts.omissions,id.omittedPaths.length);
 assert.equal(Object.keys(id.replacementHashes).length,id.counts.replacements);assert.equal(Object.keys(after).length-id.counts.replacements,id.counts.unchanged);
 assert.ok(!id.fallback?.unsafeVersionAllowed);assert.equal(id.fallback.servedMapSha256,id.sanitizedBaselineSha256);
 assert.deepEqual(config.rewrites,id.preservedDynamicRewrites);return {package:id.kind,source:id.source,counts:id.counts,servedMapSha256:id.servedMapSha256,configurationSha256:id.configurationSha256,metadataGuard:'PASS',status:'OFFLINE_VERIFIED_NOT_DEPLOYED'};
}
module.exports={verify};
if(require.main===module)console.log(JSON.stringify(verify(process.argv[2]||process.cwd()),null,2));
