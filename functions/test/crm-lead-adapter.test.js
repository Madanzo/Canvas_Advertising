'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
    buildRequestMapping,
    bearerCredential,
    classifyResponse,
    endpointFor,
    idempotencyKeyFor,
    isSyntheticTestSubmission,
    isClaimable,
    postSerializedDelivery,
    readiness,
    testSubmissionGate
} = require('../crm-lead-adapter');

function mockResponse(status, body) {
    return { status, text: async () => JSON.stringify(body) };
}

const created = {
    ok: true,
    code: 'created',
    message: 'Lead accepted.',
    data: { leadId: 'lead-1', contactId: 'contact-1', opportunityId: 'deal-1', contactCreated: true }
};

test('maps to the flat CRM contract, leaves the honeypot empty, and persists exact bytes', () => {
    const mapping = buildRequestMapping('submission-1', {
        name: 'Ada Lovelace',
        email: 'ada@example.com',
        phone: '(512) 555-0100',
        service: 'vehicle-wraps',
        website: 'https://customer.example',
        fileUploads: [{ path: 'lead-uploads/a.pdf' }],
        productionRequest: { quantity: '10' },
        visibilityPackage: { privacyConsent: true },
        tracking: { utm_source: 'google' }
    }, '2026-09-08T00:00:00.000Z');

    assert.equal(mapping.body.fullName, 'Ada Lovelace');
    assert.equal(mapping.body.requestedService, 'Vehicle Wraps');
    assert.equal(mapping.body.website, '');
    assert.equal(mapping.body.attribution.utmSource, 'google');
    assert.equal(mapping.serializedBody, JSON.stringify(mapping.body));
    assert.ok(mapping.unsupportedFields.some((item) => item.field === 'website'));
    assert.ok(mapping.unsupportedFields.some((item) => item.field === 'fileUploads'));
    assert.ok(mapping.unsupportedFields.some((item) => item.field === 'productionRequest'));
    assert.ok(mapping.unsupportedFields.some((item) => item.field === 'visibilityPackage'));
});

test('builds the tenant-slug route and stable idempotency key', () => {
    assert.equal(endpointFor('https://crm.example/', 'canvas advertising'), 'https://crm.example/api/v1/tenants/canvas%20advertising/leads/intake');
    assert.equal(idempotencyKeyFor('abc123'), 'canvas-lead:abc123');
    assert.equal(bearerCredential('key123', 'secret456'), 'mk_live_key123.secret456');
});

test('forwarding readiness fails closed until every deployment input is confirmed', () => {
    assert.equal(readiness({ enabled: false }).reason, 'test-submission-id-missing');
    assert.equal(readiness({ enabled: false, testSubmissionId: 'short' }, 'short').reason, 'test-submission-id-invalid');
    assert.equal(readiness({ enabled: true }).reason, 'base-url-missing');
    assert.equal(readiness({ enabled: true, baseUrl: 'https://crm.example' }).reason, 'tenant-slug-missing');
    assert.equal(readiness({ enabled: true, baseUrl: 'https://crm.example', tenantSlug: 'canvas' }).reason, 'credential-missing');
    assert.equal(readiness({ enabled: true, baseUrl: 'https://crm.example', tenantSlug: 'canvas', keyId: 'key', secret: 'secret' }).reason, 'service-allowlist-unconfirmed');
});

test('test-only gate authorizes exactly one configured submission while general forwarding is disabled', () => {
    const config = {
        enabled: false,
        testSubmissionId: 'canvas-test-submission-0001',
        baseUrl: 'https://crm.example',
        tenantSlug: 'canvas_advertising',
        keyId: 'key',
        secret: 'secret',
        serviceAllowlistConfirmed: true
    };

    assert.equal(testSubmissionGate(config, 'unrelated-submission-0001').authorized, false);
    assert.equal(readiness(config, 'unrelated-submission-0001').ready, false);
    assert.deepEqual(readiness(config, 'canvas-test-submission-0001'), {
        ready: true,
        reason: 'ready',
        mode: 'test-only'
    });
    assert.equal(isSyntheticTestSubmission(
        config,
        'canvas-test-submission-0001',
        'crm_integration_test'
    ), true);
    assert.equal(isSyntheticTestSubmission(
        config,
        'unrelated-submission-0001',
        'crm_integration_test'
    ), false);
    assert.equal(isSyntheticTestSubmission(
        config,
        'canvas-test-submission-0001',
        'form_submit'
    ), false);
});

test('timeout retry reuses exact bytes and creates only one CRM record', async () => {
    const serializedBody = '{"externalDocId":"canvas-test-timeout-0001","website":""}';
    const idempotencyKey = 'canvas-lead:canvas-test-timeout-0001';
    const stored = new Map();
    let calls = 0;
    const fetchImpl = async (_url, options) => {
        calls += 1;
        const existing = stored.get(options.headers['Idempotency-Key']);
        if (!existing) {
            stored.set(options.headers['Idempotency-Key'], {
                body: options.body,
                data: created.data
            });
            const error = Object.assign(new Error('client timed out after commit'), { name: 'AbortError' });
            throw error;
        }
        assert.equal(options.body, existing.body);
        return mockResponse(200, {
            ...created,
            code: 'duplicate_ignored',
            data: existing.data
        });
    };

    const first = await postSerializedDelivery({
        fetchImpl,
        baseUrl: 'https://crm.example',
        tenantSlug: 'canvas_advertising',
        credential: 'server-only',
        idempotencyKey,
        serializedBody
    });
    assert.equal(first.outcome, 'retry');

    const recovered = await postSerializedDelivery({
        fetchImpl,
        baseUrl: 'https://crm.example',
        tenantSlug: 'canvas_advertising',
        credential: 'server-only',
        idempotencyKey,
        serializedBody
    });
    assert.equal(recovered.outcome, 'accepted');
    assert.equal(recovered.duplicate, true);
    assert.equal(calls, 2);
    assert.equal(stored.size, 1, 'CRM must contain only one idempotent write');
});

test('classifies accepted, duplicate, validation, and conflict responses', () => {
    assert.equal(classifyResponse(201, created).outcome, 'accepted');
    const duplicate = classifyResponse(200, { ...created, code: 'duplicate_ignored' });
    assert.equal(duplicate.outcome, 'accepted');
    assert.equal(duplicate.duplicate, true);
    assert.equal(classifyResponse(422, { ok: false, code: 'validation_failed', errors: [{ field: 'fullName', code: 'required' }] }).outcome, 'failed');
    assert.equal(classifyResponse(409, { ok: false, code: 'idempotency_conflict' }).outcome, 'conflict');
});

test('posts the exact persisted body and accepts a CRM created response', async () => {
    const serializedBody = '{"fullName":"Ada","website":""}';
    let received;
    const result = await postSerializedDelivery({
        fetchImpl: async (url, options) => {
            received = { url, options };
            return mockResponse(201, created);
        },
        baseUrl: 'https://crm.example',
        tenantSlug: 'canvas_advertising',
        credential: 'server-only',
        idempotencyKey: 'canvas-lead:submission-1',
        serializedBody
    });
    assert.equal(received.options.body, serializedBody);
    assert.equal(received.options.headers['Idempotency-Key'], 'canvas-lead:submission-1');
    assert.equal(result.outcome, 'accepted');
});

test('mock endpoint returns duplicate acceptance without changing request bytes', async () => {
    const serializedBody = '{"externalDocId":"same-submission","website":""}';
    const result = await postSerializedDelivery({
        fetchImpl: async (_url, options) => {
            assert.equal(options.body, serializedBody);
            return mockResponse(200, {
                ...created,
                code: 'duplicate_ignored',
                message: 'Already processed.'
            });
        },
        baseUrl: 'https://crm.example',
        tenantSlug: 'canvas',
        credential: 'server-only',
        idempotencyKey: 'canvas-lead:same-submission',
        serializedBody
    });
    assert.equal(result.outcome, 'accepted');
    assert.equal(result.duplicate, true);
});

test('mock endpoint exposes validation failures as non-retryable', async () => {
    const result = await postSerializedDelivery({
        fetchImpl: async () => mockResponse(422, {
            ok: false,
            code: 'validation_failed',
            message: 'One or more fields are invalid.',
            errors: [{ field: 'fullName', code: 'required' }]
        }),
        baseUrl: 'https://crm.example',
        tenantSlug: 'canvas',
        credential: 'server-only',
        idempotencyKey: 'canvas-lead:invalid',
        serializedBody: '{}'
    });
    assert.equal(result.outcome, 'failed');
    assert.deepEqual(result.errors, [{ field: 'fullName', code: 'required' }]);
});

test('mock endpoint exposes idempotency conflicts without retrying', async () => {
    const result = await postSerializedDelivery({
        fetchImpl: async () => mockResponse(409, {
            ok: false,
            code: 'idempotency_conflict',
            message: 'Key was already used with different bytes.'
        }),
        baseUrl: 'https://crm.example',
        tenantSlug: 'canvas',
        credential: 'server-only',
        idempotencyKey: 'canvas-lead:conflict',
        serializedBody: '{"fullName":"Changed"}'
    });
    assert.equal(result.outcome, 'conflict');
});

test('times out and marks the delivery retryable', async () => {
    const result = await postSerializedDelivery({
        fetchImpl: (_url, options) => new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
        baseUrl: 'https://crm.example',
        tenantSlug: 'canvas',
        credential: 'server-only',
        idempotencyKey: 'canvas-lead:timeout',
        serializedBody: '{}',
        timeoutMs: 5
    });
    assert.equal(result.outcome, 'retry');
    assert.equal(result.code, 'timeout');
});

test('recovers a delivery after an interrupted processing lease expires', () => {
    assert.equal(isClaimable({ status: 'processing', processingLeaseExpiresAt: 2000 }, 1000), false);
    assert.equal(isClaimable({ status: 'processing', processingLeaseExpiresAt: 1000 }, 2000), true);
    assert.equal(isClaimable({ status: 'accepted' }, 2000), false);
});
