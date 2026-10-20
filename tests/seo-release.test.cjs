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
test('corrected source artifacts bind exact reviewed bytes for only four paths',()=>{
 const p=JSON.parse(fs.readFileSync('release-evidence/corrected-source/artifacts.json'));
 assert.deepEqual(p.records.map(r=>r.path).sort(),['/index-es.html','/index.html','/large-format-printing-austin-es.html','/large-format-printing-austin.html']);
 const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
 for(const c of p.records){const b=fs.readFileSync(c.path.slice(1)),compressed=fs.readFileSync('release-evidence/corrected-source'+c.path+'.gz');assert.equal(hash(b),c.rawSha256);assert.equal(hash(compressed),c.gzipSha256);assert.deepEqual(zlib.gunzipSync(compressed),b);}
});
for(const file of ['index.html','index-es.html','large-format-printing-austin.html','large-format-printing-austin-es.html'])test(file+': no unconfirmed minimum or fixed production deadline',()=>{
 const html=fs.readFileSync(file,'utf8'),copy=html.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ');
 assert.ok(!/no minimum order|sin pedido m[ií]nimo|no MOQ|same[- ]week|next[- ]day|misma semana|\b[1-5]\s*[-–]\s*[1-5]\s*(?:business\s+)?days|\b[1-5]\s*(?:-|–|a)\s*[1-5]\s*d[ií]as|within 24 hours|en 24 horas/i.test(copy),'unconfirmed production/minimum promise');
});
for(const file of ['large-format-printing-austin.html','large-format-printing-austin-es.html'])test(file+': timing/minimum FAQ visible and JSON-LD agree',()=>{
 const html=fs.readFileSync(file,'utf8'),graphs=[...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].flatMap(m=>JSON.parse(m[1])['@graph']||[]),faq=graphs.find(g=>g['@type']==='FAQPage');
 for(const q of [faq.mainEntity[0],faq.mainEntity.at(-1)]){assert.ok(html.includes('<h3 class="faq__question">'+q.name+'</h3>'));assert.ok(html.includes('<p class="faq__answer">'+q.acceptedAnswer.text+'</p>'));assert.match(q.acceptedAnswer.text,/quote|cotizaci[oó]n/i);}
 if(file.includes('-es.'))for(const q of [faq.mainEntity[0],faq.mainEntity.at(-1)])assert.match(q.name,/^¿/);
});
test('Spanish policy headline and search metadata do not promise speed',()=>{const home=fs.readFileSync('index-es.html','utf8'),print=fs.readFileSync('large-format-printing-austin-es.html','utf8');assert.ok(!/<h3[^>]*>Entrega Rápida<\/h3>/.test(home));assert.ok(!/<meta[^>]+Fast turnaround/.test(print));});
