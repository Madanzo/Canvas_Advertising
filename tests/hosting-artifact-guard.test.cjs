const {test}=require('node:test'),assert=require('node:assert/strict');
const {assertSafeManifest,sanitizeManifest,assertTransition}=require('../.github/scripts/hosting-artifact-guard.cjs');
const h='a'.repeat(64),j='b'.repeat(64),config={cleanUrls:true,rewrites:[{glob:'/projects/**',function:'serveProjectPage'},{glob:'/es/proyectos/**',function:'serveProjectPage'}]};
const {assertUnavailableStatus}=require('../.github/scripts/verify-hosting-domains.cjs');
test('domain verification rejects HTTP200 including SPA fallback and redirects',()=>{for(const s of [200,204,301,302,307,500])assert.throws(()=>assertUnavailableStatus(s));});
test('domain verification accepts only explicit unavailable statuses',()=>{for(const s of [403,404,410])assert.doesNotThrow(()=>assertUnavailableStatus(s));});
for(const p of ['/.git/HEAD','/.git/config','/.git/objects/ab/cd','/nested/.git/index','/.GIT/config','/%2egit/config','/%252egit/config','/.hg/store','/.svn/entries','/.bzr/branch','/.gitignore','/.gitattributes','/.gitmodules','/.github/workflows/deploy.yml','/.gitlab-ci.yml','/.codex/settings','/.agents/AGENTS.md','/.vscode/settings.json','/.DS_Store'])test('guard rejects '+p,()=>assert.throws(()=>assertSafeManifest({[p]:h})));
for(const p of ['/a/../.git/HEAD','//.git/HEAD','/a\\.git\\HEAD','/a/%2f../x','/a/%00x'])test('guard rejects ambiguous path '+p,()=>assert.throws(()=>assertSafeManifest({[p]:h})));
test('ordinary public and well-known files are allowed',()=>assert.ok(assertSafeManifest({'/index.html':h,'/images/logo.png':h,'/.well-known/security.txt':h})));
test('containment omits metadata only and fallback remains safe',()=>{
 const before={'/.git/HEAD':h,'/.git/config':j,'/index.html':h,'/css/styles.css':j};const {map,omitted}=sanitizeManifest(before);
 assert.deepEqual(map,{'/index.html':h,'/css/styles.css':j});assert.equal(omitted.length,2);
 assert.ok(assertTransition(before,map,{omitted,configBefore:config,configAfter:config}));
 assert.ok(assertTransition(map,{...map,'/index.html':j},{replacements:{'/index.html':j},configBefore:config,configAfter:config}));
 assert.ok(assertTransition(map,map,{configBefore:config,configAfter:config}));
 assert.throws(()=>assertSafeManifest(before),'unsafe historical version cannot be fallback');
});
test('transition refuses ordinary file loss, addition, unreviewed replacement or rewrite change',()=>{
 const before={'/index.html':h,'/logo.png':j};
 for(const after of [{'/index.html':h},{...before,'/new.html':h},{...before,'/index.html':j}])assert.throws(()=>assertTransition(before,after,{configBefore:config,configAfter:config}));
 assert.throws(()=>assertTransition(before,before,{configBefore:config,configAfter:{cleanUrls:true}}));
 assert.throws(()=>assertTransition(before,{'/index.html':h},{omitted:['/logo.png'],configBefore:config,configAfter:config}));
});
test('malformed hashes and encoded metadata cannot bypass artifact/API guard',()=>{assert.throws(()=>assertSafeManifest({'/index.html':'bad'}));assert.throws(()=>assertSafeManifest({'/%25252egit/HEAD':h}));assert.throws(()=>assertSafeManifest({'/%252525252egit/HEAD':h}));assert.throws(()=>assertSafeManifest({'/.git-credentials':h}));});
test('fallback explicitly reverts reviewed public hashes from SEO while retaining containment',()=>{
 const safe={'/index.html':h,'/css/styles.css':j},seo={...safe,'/index.html':j};
 assert.ok(assertTransition(seo,safe,{replacements:{'/index.html':h},configBefore:config,configAfter:config}));
 assert.throws(()=>assertTransition(seo,{...safe,'/.git/HEAD':h},{replacements:{'/index.html':h},configBefore:config,configAfter:config}));
 assert.throws(()=>assertTransition(seo,safe,{configBefore:config,configAfter:config}),'unrecorded reversion must fail');
});
