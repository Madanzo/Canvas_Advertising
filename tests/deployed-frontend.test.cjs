"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,".."),baseline=require("../docs/frontend-reconciliation-baseline.json");
// This reconciliation intentionally pins the approved production bytes. Future frontend changes
// must update this provenance check deliberately, rather than silently replacing live content.
for(const file of baseline.files) test("matches deployed Hosting bytes: "+file.path,()=>{
 const bytes=fs.readFileSync(path.join(root,file.path));
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
