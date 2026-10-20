const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const crypto=require('node:crypto'),zlib=require('node:zlib');
const files=['index.html','index-es.html','commercial-fleet-wraps-austin.html','commercial-fleet-wraps-austin-es.html','large-format-printing-austin.html','large-format-printing-austin-es.html','vehicle-wrap-file-preparation-checklist.html','lista-preparacion-archivos-wrap.html'];
const matches=(s,re)=>[...s.matchAll(re)].map(m=>m[0]);
for(const file of files) test(file+': live-baseline preservation and SEO checks',()=>{
 const a=fs.readFileSync('release-evidence/baseline/'+file,'utf8'),b=fs.readFileSync(file,'utf8');
 assert.equal(matches(b,/<h1\b/gi).length,1);
 assert.deepEqual(matches(b,/<link[^>]+(?:canonical|hreflang)[^>]*>/g),matches(a,/<link[^>]+(?:canonical|hreflang)[^>]*>/g));
 assert.deepEqual(matches(b,/<script\b[^>]*\bsrc=[^>]+>/g),matches(a,/<script\b[^>]*\bsrc=[^>]+>/g));
 assert.deepEqual(matches(b,/<img\b[^>]*>/g),matches(a,/<img\b[^>]*>/g));
 assert.deepEqual(matches(b,/<(?:input|select|textarea|form)\b[^>]*>/g),matches(a,/<(?:input|select|textarea|form)\b[^>]*>/g));
 assert.deepEqual(matches(b,/(?:href="tel:[^"]+"|url\('[^']+'\))/g),matches(a,/(?:href="tel:[^"]+"|url\('[^']+'\))/g));
 for(const m of b.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) JSON.parse(m[1]);
 for(const m of b.matchAll(/href="#([^"]+)"/g)) assert.ok(b.includes('id="'+m[1]+'"') || (file.startsWith('index') && a.includes('href="#'+m[1]+'"')),'broken anchor '+m[1]);
 assert.ok(!/no MOQ|No\. Whether you need/i.test(b),'unconfirmed minimum-order promise');
 assert.ok(!/Free design|completely free|completamente gratis|Diseño Gratis/i.test(b),'unscoped design promise');
 assert.ok(!/7-12 years warranty|De 7 a 12 años|Zeno Certified|100% garantizada/i.test(b),'unsupported warranty/certification');
 assert.ok(!/<meta[^>]+noindex/i.test(b));
});
test('release artifacts bind exact bytes and restrict technical-first overlay to four paths',()=>{
 const p=JSON.parse(fs.readFileSync('release-evidence/package.json'));
 const t=JSON.parse(fs.readFileSync('release-evidence/technical-package.json'));
 assert.equal(p.status,'PREPARED_NOT_DEPLOYED');assert.equal(p.changed.length,8);assert.equal(t.changed.length,4);
 assert.equal(t.preservedFileCount,2016);assert.equal(p.fileCount,2020);
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 for(const c of p.changed){const b=fs.readFileSync(c.path.slice(1));assert.equal(hash(b),c.after);assert.equal(hash(zlib.gzipSync(b,{level:9})),c.afterHostingHash);assert.equal(hash(fs.readFileSync('release-evidence/baseline'+c.path)),c.before);}
 assert.deepEqual(t.hostingConfig,p.hostingConfig);assert.ok(t.hostingConfigUnchanged);
});
