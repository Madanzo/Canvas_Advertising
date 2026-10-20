'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const REPOSITORY=new Set(['.git','.hg','.svn','.bzr','.github','.gitlab','.gitignore','.gitattributes','.gitmodules','.gitkeep','.gitconfig','.git-credentials','.gitcookies','.gitlab-ci.yml','.idea','.vscode','.agents','.codex','.ds_store']);
function decodedSegments(p){
 assert.equal(typeof p,'string','Manifest path must be a string');
 assert.ok(p.startsWith('/')&&!/[\\\x00-\x1f?#]/.test(p),'Non-canonical manifest path: '+p);
 let d=p;for(let i=0;i<4;i++){const next=decodeURIComponent(d);if(next===d)break;d=next;}
 assert.ok(!/[\\\x00-\x1f?#]/.test(d)&&!/%[a-f0-9]{2}/i.test(d),'Unsafe or excessively encoded path');
 const parts=d.split('/').slice(1);assert.ok(parts.every(s=>s&&s!=='.'&&s!=='..'),'Traversal/empty path segment');
 return parts.map(s=>s.toLowerCase());
}
function metadataPath(p){return decodedSegments(p).some(s=>REPOSITORY.has(s));}
function assertSafeManifest(map){
 assert.ok(map&&typeof map==='object'&&!Array.isArray(map),'Expected a served path/hash object');
 for(const [p,h]of Object.entries(map)){assert.ok(!metadataPath(p),'Repository metadata forbidden in served map: '+p);assert.match(h,/^[a-f0-9]{64}$/,'Invalid Hosting hash');}
 return true;
}
function sanitizeManifest(before){
 const omitted=[],map={};for(const [p,h]of Object.entries(before)){if(metadataPath(p))omitted.push(p);else map[p]=h;}
 assertSafeManifest(map);assert.equal(Object.keys(before).length,Object.keys(map).length+omitted.length);
 return {map,omitted:omitted.sort()};
}
function assertTransition(before,after,{omitted=[],replacements={},configBefore,configAfter}={}){
 assertSafeManifest(after);assert.deepEqual(configAfter,configBefore,'Hosting configuration/rewrite drift');
 const expected={...before};for(const p of omitted){assert.ok(metadataPath(p),'Refusing ordinary public-file omission');assert.ok(Object.hasOwn(before,p));delete expected[p];}
 for(const [p,h]of Object.entries(replacements)){assert.ok(Object.hasOwn(expected,p),'Refusing addition');expected[p]=h;}
 assert.deepEqual(after,expected,'Unreviewed additions/deletions/replacements');return true;
}
function canonical(o){return JSON.stringify(Array.isArray(o)?o.map(x=>JSON.parse(canonical(x))):o&&typeof o==='object'?Object.fromEntries(Object.keys(o).sort().map(k=>[k,JSON.parse(canonical(o[k]))])):o);}
function sha256(b){return crypto.createHash('sha256').update(b).digest('hex');}
module.exports={metadataPath,assertSafeManifest,sanitizeManifest,assertTransition,canonical,sha256};
if(require.main===module){const fs=require('node:fs');assert.ok(process.argv[2],'Usage: node hosting-artifact-guard.cjs served-map.json');assertSafeManifest(JSON.parse(fs.readFileSync(process.argv[2])));console.log('PASS: served map contains no repository metadata');}
