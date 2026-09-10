'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../functions/test/fixtures/split-overlay');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json')));
assert.equal(manifest.sourceSha,'2559dad2ba22257e1e9ea487775fd9d0987a913a');
for(const pkg of manifest.packages) for(const part of pkg.parts){
 const bytes=fs.readFileSync(path.join(root,part.file));
 assert.equal(bytes.length,part.endUtf8Byte-part.startUtf8Byte);
 assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),part.sha256);
 assert.ok(!/(AIza[0-9A-Za-z_-]{30,}|sk_live_[0-9A-Za-z]{12,}|mk_live_[0-9A-Za-z]{12,}\.|-----BEGIN .*PRIVATE KEY-----)/.test(bytes.toString()));
}
console.log('Verified four exact source ranges and absence of prohibited credential patterns; no runtime config/archive included.');
