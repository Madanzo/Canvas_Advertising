'use strict';

const assert = require('node:assert/strict');

const BASE_URL = String(process.env.CRM_E2E_BASE_URL || 'https://crm.merkadagency.com').replace(/\/$/, '');
const TENANT_SLUG = 'canvas_advertising';
const KEY_ID = process.env.CRM_E2E_KEY_ID || '';
const SECRET = process.env.CRM_E2E_SECRET || '';
const WRITE_CONFIRMATION = process.env.CRM_E2E_CONFIRM_WRITE || '';

function requireConfiguration() {
    const missing = [];
    if (!KEY_ID) missing.push('CRM_E2E_KEY_ID');
    if (!SECRET) missing.push('CRM_E2E_SECRET');
    if (WRITE_CONFIRMATION !== 'YES_SYNTHETIC_WRITES') missing.push('CRM_E2E_CONFIRM_WRITE=YES_SYNTHETIC_WRITES');
    if (missing.length) {
        throw new Error(`E2E test is disabled. Missing: ${missing.join(', ')}`);
    }
}

function endpoint() {
    return `${BASE_URL}/api/v1/tenants/${TENANT_SLUG}/leads/intake`;
}

function syntheticBody(externalDocId, overrides = {}) {
    return {
        fullName: 'Canvas Integration Test',
        firstName: 'Canvas',
        lastName: 'Integration Test',
        email: `canvas-e2e-${externalDocId}@example.invalid`,
        phone: '+15125550199',
        requestedService: 'Vehicle Wraps',
        estimatedBudget: '$4,500 - $6,000',
        desiredTimeline: 'Testing only',
        message: 'Synthetic Canvas CRM contract test. Do not contact.',
        preferredContactMethod: 'email',
        marketingConsent: false,
        smsConsent: false,
        attribution: {
            pageUrl: 'https://canvas-advertising.com/integration-test',
            landingPage: 'https://canvas-advertising.com/integration-test',
            utmSource: 'integration-test',
            utmMedium: 'automated',
            utmCampaign: 'canvas-crm-e2e'
        },
        submittedAt: new Date().toISOString(),
        sourceSystem: 'canvas-advertising.com:e2e',
        externalDocId,
        turnstileVerified: null,
        website: '',
        ...overrides
    };
}

async function submit(idempotencyKey, serializedBody, timeoutMs = 8000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(endpoint(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer mk_live_${KEY_ID}.${SECRET}`,
                'Idempotency-Key': idempotencyKey
            },
            body: serializedBody,
            signal: controller.signal
        });
        const payload = await response.json();
        return { status: response.status, payload };
    } finally {
        clearTimeout(timeout);
    }
}

function crmIds(result) {
    return {
        leadId: result.payload.data?.leadId || null,
        contactId: result.payload.data?.contactId || null,
        opportunityId: result.payload.data?.opportunityId || null
    };
}

async function main() {
    requireConfiguration();
    const runId = `${Date.now()}-${process.pid}`;

    const successKey = `canvas-e2e:success:${runId}`;
    const successBytes = JSON.stringify(syntheticBody(`canvas-e2e-success-${runId}`));
    const created = await submit(successKey, successBytes);
    assert.equal(created.status, 201);
    assert.equal(created.payload.code, 'created');

    const duplicate = await submit(successKey, successBytes);
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.payload.code, 'duplicate_ignored');
    assert.deepEqual(crmIds(duplicate), crmIds(created), 'identical retry must return the original CRM IDs');

    const conflictBytes = JSON.stringify({
        ...JSON.parse(successBytes),
        message: 'Changed bytes for the intentional idempotency conflict test.'
    });
    const conflict = await submit(successKey, conflictBytes);
    assert.equal(conflict.status, 409);
    assert.equal(conflict.payload.code, 'idempotency_conflict');

    const unsupportedKey = `canvas-e2e:unsupported:${runId}`;
    const unsupportedBytes = JSON.stringify(syntheticBody(`canvas-e2e-unsupported-${runId}`, {
        requestedService: `Unsupported Canvas E2E Service ${runId}`
    }));
    const unsupported = await submit(unsupportedKey, unsupportedBytes);
    assert.equal(unsupported.status, 422);
    assert.equal(unsupported.payload.code, 'unsupported_service');

    const timeoutKey = `canvas-e2e:timeout:${runId}`;
    const timeoutBytes = JSON.stringify(syntheticBody(`canvas-e2e-timeout-${runId}`));
    let timedOut = false;
    try {
        await submit(timeoutKey, timeoutBytes, 1);
    } catch (error) {
        timedOut = error?.name === 'AbortError';
        if (!timedOut) throw error;
    }
    assert.equal(timedOut, true, 'the first timeout fixture must abort locally');

    const recovered = await submit(timeoutKey, timeoutBytes);
    assert.ok([200, 201].includes(recovered.status));
    assert.ok(['created', 'duplicate_ignored'].includes(recovered.payload.code));

    const recoveredDuplicate = await submit(timeoutKey, timeoutBytes);
    assert.equal(recoveredDuplicate.status, 200);
    assert.equal(recoveredDuplicate.payload.code, 'duplicate_ignored');
    assert.deepEqual(crmIds(recoveredDuplicate), crmIds(recovered), 'timeout recovery must preserve CRM IDs');

    console.log(JSON.stringify({
        endpoint: endpoint(),
        tenantSlug: TENANT_SLUG,
        cases: {
            created: created.payload.code,
            identicalRetry: duplicate.payload.code,
            conflictingRetry: conflict.payload.code,
            unsupportedService: unsupported.payload.code,
            timeoutRecovery: recovered.payload.code,
            timeoutRecoveryRetry: recoveredDuplicate.payload.code
        }
    }, null, 2));
}

main().catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
});
