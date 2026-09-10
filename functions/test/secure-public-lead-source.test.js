'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const runtimeSource = fs.readFileSync(path.join(root, 'functions', 'index.js'), 'utf8');
const firestoreRules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const storageRules = fs.readFileSync(path.join(root, 'storage.rules'), 'utf8');
const browserSource = fs.readFileSync(path.join(root, 'js', 'firebase-config.js'), 'utf8');

test('public Firestore lead creation remains denied', () => {
    assert.match(firestoreRules, /match \/canvas_leads\/\{leadId\}[\s\S]*?allow create: if false;/);
    assert.doesNotMatch(firestoreRules, /match \/canvas_leads[\s\S]*?allow create: if true;/);
});

test('secure callable validates, rate-limits, and transactionally stores leads', () => {
    assert.match(runtimeSource, /const PUBLIC_LEAD_FIELDS = new Set/);
    assert.match(runtimeSource, /async function enforcePublicLeadRateLimit/);
    assert.match(runtimeSource, /exports\.submitPublicLead = configuredFunctions\.https\.onCall/);
    assert.match(runtimeSource, /await verifyLeadUploads\(validated\.submissionId, validated\.lead\.fileUploads\)/);
    assert.match(runtimeSource, /transaction\.create\(ref,/);
});

test('upload sessions bind approved paths and Storage rules verify authorization', () => {
    assert.match(runtimeSource, /exports\.createLeadUploadSession = configuredFunctions\.https\.onCall/);
    assert.match(runtimeSource, /allowedPaths: authorizedFiles\.map/);
    assert.match(runtimeSource, /custom\.uploadToken !== session\.token/);
    assert.match(storageRules, /match \/lead-uploads\/\{submissionId\}\/\{fileId\}\/\{fileName\}/);
    assert.match(storageRules, /firestore\.get/);
});

test('browser submission uses the callable and does not directly create a lead', () => {
    assert.match(browserSource, /httpsCallable\('submitPublicLead'\)/);
    assert.doesNotMatch(browserSource, /db\.collection\('canvas_leads'\)\.add\(lead\)/);
});

test('controlled notification isolation requires both exact ID and synthetic source', () => {
    assert.match(runtimeSource, /isSyntheticTestSubmission\([\s\S]*?context\.params\.leadId,[\s\S]*?leadData\.source/);
    assert.match(runtimeSource, /Skipping Canvas notification workflows for approved CRM integration test/);
});
