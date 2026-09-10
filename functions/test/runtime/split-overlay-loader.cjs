'use strict';
// Exact export/helper slices, with production Firebase imports and real emulator transactions.
// Bootstrap replaces unrelated integrations with forbidden provider boundaries. Never reads live config.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Module = require('node:module');
const assert = require('node:assert/strict');
const fixtureRoot = path.join(__dirname, '../fixtures/split-overlay');
const manifest = JSON.parse(fs.readFileSync(path.join(fixtureRoot, 'manifest.json')));
const functionRoot = path.join(__dirname, '../..');
module.exports = function loadSplitOverlay() {
    assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
    assert.equal(process.env.GCLOUD_PROJECT, 'demo-canvas-integration');
    const all = {};
    for (const name of ['public-adapter-targets','sms-targets']) {
        const fixture = manifest.packages.find(p=>p.name===name);
        const body = fixture.parts.map(part=>{
            const bytes=fs.readFileSync(path.join(fixtureRoot,part.file));
            assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),part.sha256);
            return bytes.toString();
        }).join('\n');
        const bootstrap = `
const functions=require('firebase-functions/v1');
const admin=require('firebase-admin');
const crypto=require('crypto');
const configuredFunctions=functions.runWith({secrets:['FUNCTIONS_CONFIG_EXPORT']});
const communicationsPolicy=require('./communications-policy');
const smsConsent=require('./sms-consent');
const crmTestAuthorization=require('./crm-test-authorization');
const crmTestState=require('./crm-test-state');
${name==='public-adapter-targets' ? 'admin.initializeApp();' : ''}
const db=admin.firestore();
const getPlivo=()=>{throw Error('Forbidden provider access in split-overlay test');};
const getResend=()=>{throw Error('Forbidden provider access in split-overlay test');};
`;
        const filename=path.join(functionRoot,'.emulator-'+name+'.js');
        const loaded=new Module(filename,module);loaded.filename=filename;loaded.paths=Module._nodeModulePaths(functionRoot);
        loaded._compile(bootstrap+'\n'+body,filename);
        Object.assign(all,loaded.exports);
    }
    return all;
};
