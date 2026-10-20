const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const baseline='47583ca3b248e34c40d0393a42a4db45b401436b';
const matches=(s,re)=>[...s.matchAll(re)].map(m=>m[0]);
for(const es of [false,true]){const file='large-format-printing-austin'+(es?'-es':'')+'.html',s=fs.readFileSync(file,'utf8'),old=cp.execFileSync('git',['show',baseline+':'+file]).toString();
test(file+': no runtime/media/navigation or submission contract changes',()=>{
 for(const re of [/<script\b[^>]*\bsrc=[^>]+>/g,/<img\b[^>]*>/g,/<nav\b[\s\S]*?<\/nav>/g,/url\('[^']+'\)/g])assert.deepEqual(matches(s,re),matches(old,re));
 const formTags=x=>matches(x,/<(?:input|select|textarea|form)\b[^>]*>/g).map(t=>t.replace(/ placeholder="[^"]*"/g,''));assert.deepEqual(formTags(s),formTags(old));
 assert.deepEqual(matches(s,/<option value="[^"]*"/g),matches(old,/<option value="[^"]*"/g));
 const scripts=x=>matches(x,/<script(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/g);assert.deepEqual(scripts(s),scripts(old));
});
test(file+': complete localized FAQ and clean metadata match',()=>{
 assert.equal(matches(s,/<h1\b/gi).length,1);const desc=s.match(/<meta name="description"\s+content="([^"]*)"/)[1];
 for(const name of ['og:description','twitter:description'])assert.ok(s.includes(name+'" content="'+desc+'"'));
 const url='https://canvas-advertising.com/'+file.replace('.html','');assert.ok(s.includes('rel="canonical" href="'+url+'"'));assert.deepEqual(matches(s,/<link[^>]+(?:canonical|hreflang)[^>]*>/g),matches(old,/<link[^>]+(?:canonical|hreflang)[^>]*>/g));
 const graph=JSON.parse(s.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];const faq=graph.find(x=>x['@type']==='FAQPage');assert.equal(faq['@id'],url+'#faq');assert.equal(faq.mainEntity.length,4);
 for(const q of faq.mainEntity){assert.ok(s.includes('<h3 class="faq__question">'+q.name+'</h3>'));assert.ok(s.includes('<p class="faq__answer">'+q.acceptedAnswer.text+'</p>'));if(es)assert.ok(q.name.startsWith('¿'));}
});
test(file+': quote requirements, human contact and intent boundaries',()=>{
 const hero=s.match(/<div class="partner-hero__cta">([\s\S]*?)<\/div>/)[1];assert.match(hero,/href="#partner-contact"/);assert.ok(hero.includes('href="tel:'+(es?'+15129459783':'+15124343793')+'"'));
 assert.match(s,/href="mailto:sales@canvas-advertising.com"/);assert.ok(s.includes('href="'+(es?'lista-preparacion-archivos-wrap':'vehicle-wrap-file-preparation-checklist')+'"'));assert.ok(s.includes('href="partner'+(es?'-es':'')+'"'));
 assert.equal(matches(s.match(/id="quote-requirements"([\s\S]*?)<\/section>/)[1],/<li>/g).length,6);
 for(const m of s.matchAll(/href="#([^"]+)"/g))assert.ok(s.includes('id="'+m[1]+'"'),'broken '+m[1]);
 assert.ok(!/no MOQ|no minimum|same.week|GRATIS|white-label|blind shipping|more you save|anywhere in the United States/i.test(s));assert.ok(!/finix|squareup|checkoutSession|staffDraft/i.test(s));
});}
