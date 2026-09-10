"use strict";
// Local source artifact only: no network, deployment, credentials or settings changes.
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const [input, expectedSha256, output]=process.argv.slice(2);
if (!input || !expectedSha256 || !output) throw Error('Usage: node tools/stage-legacy-crm-fix.cjs VERIFIED_LIVE_INDEX EXPECTED_SHA256 EMPTY_OUTPUT_DIR');
const bytes=fs.readFileSync(input), source=bytes.toString();
if (crypto.createHash('sha256').update(bytes).digest('hex')!==expectedSha256) throw Error('Baseline hash mismatch');
const start=source.indexOf('exports.syncLeadToCRM = functions.firestore');
const end=source.indexOf('exports.syncOrderToCRM =',start);
if(start<0 || end<0 || !source.slice(start,end).includes('functions.config().crm?.api_url')) throw Error('Not the reviewed legacy trigger; rebase required');
if(fs.existsSync(output) && fs.readdirSync(output).length) throw Error('Output must be empty');
const replacement="exports.syncLeadToCRM = functions.firestore\n    .document('canvas_leads/{leadId}')\n    .onCreate(require('./legacy-crm-trigger').runtimeHandler(process.env, (...args) => fetch(...args)));\n\n";
fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'index.js'),source.slice(0,start)+replacement+source.slice(end));
fs.copyFileSync(path.join(__dirname,'../functions/legacy-crm-trigger.js'),path.join(output,'legacy-crm-trigger.js'));
console.log('Local artifact only. Exactly syncLeadToCRM replaced; other deployed handlers preserved. No deployment authorization.');
