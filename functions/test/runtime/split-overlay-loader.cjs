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
    const all = {}, admins = [];
    for (const name of ['public-adapter-targets','sms-targets']) {
        const fixture = manifest.packages.find(p=>p.name===name);
        const dependencyRoot = path.join(fixtureRoot,name);
        const packageRequire = Module.createRequire(path.join(dependencyRoot,'package.json'));
        assert.ok(packageRequire.resolve('firebase-functions/v1').startsWith(path.join(dependencyRoot,'node_modules')));
        assert.ok(packageRequire.resolve('firebase-admin').startsWith(path.join(dependencyRoot,'node_modules')));
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
admin.initializeApp();
const db=admin.firestore();
const getPlivo=()=>{throw Error('Forbidden provider access in split-overlay test');};
const getResend=()=>{throw Error('Forbidden provider access in split-overlay test');};
`;
        const filename=path.join(functionRoot,'.emulator-'+name+'.js');
        const loaded=new Module(filename,module);loaded.filename=filename;loaded.paths=Module._nodeModulePaths(dependencyRoot);
        const relativeRequire=loaded.require.bind(loaded);
        // Node caches external resolution by parent directory, so use each package's
        // own require function rather than only replacing Module.paths.
        loaded.require=request=>request.startsWith('.') ? relativeRequire(request) : packageRequire(request);
        loaded._compile(bootstrap+'\n'+body+'\nif (typeof processInstance === "function") exports.__splitProcessInstance = processInstance;',filename);
        admins.push(packageRequire('firebase-admin'));
        Object.assign(all,loaded.exports);
    }
    assert.notEqual(admins[0],admins[1], 'Each package must load its own Admin SDK');
    for(const admin of admins) assert.equal(admin.app().options.projectId,'demo-canvas-integration');
    all.__splitAdmin=admins[0];
    all.__splitDispose=async()=>{for(const admin of admins) await admin.app().delete();};
    return all;
};
