"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,".."),baseline=require("../docs/frontend-reconciliation-baseline.json");
// Keep the deployed provenance immutable. Strip ONLY the explicitly isolated
// commerce additions before comparing the unchanged legacy frontend bytes.
// This does not claim the commerce candidate has been deployed.
function legacyBytes(file) {
 let source=fs.readFileSync(path.join(root,file),'utf8');
 if(file==='js/main.js') {
  const start=source.indexOf('\n\n\n// Commerce uses the website proxy,');
  assert.ok(start>0,'expected isolated commerce append boundary');
  source=source.slice(0,start)+'\n';
  source=source.replace("    if (document.getElementById('commerce-app')) {\n        initNavigation();\n        window.initCanvasCommerce();\n        window.addEventListener('hashchange', () => {\n            if (new URLSearchParams(location.hash.slice(1)).has('recover')) location.reload();\n        });\n        return;\n    }\n",'');
 }
 if(file==='css/styles.css') source=source.replace(/\/\* Commerce: scoped[\s\S]*?@media \(max-width: 480px\)[^\n]*\n/,'');
 if(file==='js/firebase-config.js') source=source.replace(/^    commerce: async [\s\S]*?^    init:/m,'    init:');
 return Buffer.from(source);
}
for(const file of baseline.files) test("preserves deployed non-commerce frontend bytes: "+file.path,()=>{
 const bytes=legacyBytes(file.path);
 assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),file.sha256);
});
for(const locale of ["en","es"]) test(locale+": deployed App Check reference, phone and saved-only confirmation",()=>{
 const html=fs.readFileSync(path.join(root,locale==="en"?"quote.html":"quote-es.html"),"utf8");
 assert.match(html,/src="\/js\/firebase-config\.js\?v=20260910-2bf92bc"/);
 assert.match(html,/src="\/js\/main\.js\?v=quote-redesign-2"/);
 assert.ok(html.includes(locale==="en"?'href="tel:+15124343793"':'href="tel:+15129459783"'));
 assert.ok(html.includes(locale==="en"?"Your project details are saved":"Guardamos los detalles de su proyecto"));
 assert.ok(!html.includes("LOCAL PREVIEW"));
});
