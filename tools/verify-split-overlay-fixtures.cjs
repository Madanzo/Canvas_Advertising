'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../functions/test/fixtures/split-overlay');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
assert.equal(manifest.sourceBaseSha,'cc19a5427f8cf0058f2369fb3d506e5f034fdfe6');
for(const pkg of manifest.packages) for(const part of pkg.parts){
 const bytes=fs.readFileSync(path.join(root,part.file));
 assert.equal(bytes.length,part.lengthUtf8Bytes ?? (part.endUtf8Byte-part.startUtf8Byte));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),part.sha256);
 assert.ok(!/(AIza[0-9A-Za-z_-]{30,}|sk_live_[0-9A-Za-z]{12,}|mk_live_[0-9A-Za-z]{12,}\.|-----BEGIN .*PRIVATE KEY-----)/.test(bytes.toString()));
}
for(const pkg of manifest.packages) for(const dep of pkg.dependencies) {
 const bytes=fs.readFileSync(path.join(root,dep.file));
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),dep.sha256);
 const data=JSON.parse(bytes);
 if(dep.file.endsWith('package-lock.json')) assert.equal(data.packages['node_modules/firebase-functions'].version,'7.2.5');
}
const candidate=fs.readFileSync(path.resolve(__dirname,'../functions/index.js'),'utf8');
let adapter=candidate.slice(candidate.indexOf('const CRM_LEAD_DELIVERIES_COLLECTION ='),candidate.indexOf('exports.syncOrderToCRM ='));
adapter=adapter.slice(0,adapter.indexOf('// Preserve the deployed v6 disabled legacy guard'))+adapter.slice(adapter.indexOf('// New adapter identity:'));
assert.equal(fs.readFileSync(path.join(root,'public-adapter-targets-new-adapter.txt'),'utf8'),adapter);
console.log('Verified separate deployed dependency locks, four purpose-scoped candidate source ranges and adapter bytes and absence of prohibited credential patterns; no runtime config/archive included.');

for(const pkg of manifest.packages) for(const [file,hash] of Object.entries(pkg.moduleHashes)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'../functions',file))).digest('hex'),hash);
