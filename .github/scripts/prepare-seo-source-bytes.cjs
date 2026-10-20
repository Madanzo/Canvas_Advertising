// Generate reviewed upload artifacts from the four website source paths only.
const fs=require('node:fs'),zlib=require('node:zlib'),path=require('node:path');
const {sha256}=require('./hosting-artifact-guard.cjs');
const files=['index.html','index-es.html','large-format-printing-austin.html','large-format-printing-austin-es.html'];
const dir='release-evidence/corrected-source';fs.mkdirSync(dir,{recursive:true});
const records=files.map(file=>{const raw=fs.readFileSync(file),gzip=zlib.gzipSync(raw,{level:9});fs.writeFileSync(path.join(dir,file+'.gz'),gzip);return {path:'/'+file,rawSha256:sha256(raw),gzipSha256:sha256(gzip),rawBytes:raw.length,gzipBytes:gzip.length};});
fs.writeFileSync(dir+'/artifacts.json',JSON.stringify({historicalSource:'f8a0c11da9b532766c3c1311bfd3906291ecd301',records},null,2)+'\n');
