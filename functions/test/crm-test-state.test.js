'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const state = require('../crm-test-state');
const authorization = require('../crm-test-authorization');
const adapter = require('../crm-lead-adapter');

class MemoryDb {
    constructor(entries = {}) {
        this.docs = new Map(Object.entries(entries));
        this.queue = Promise.resolve();
        this.failNextCommit = false;
    }

    ref(path) {
        const db = this;
        return {
            path,
            async get() {
                const data = db.docs.get(path);
                return { exists: data !== undefined, data: () => data, ref: this };
            }
        };
    }

    runTransaction(callback) {
        const run = this.queue.then(async () => {
            const writes = [];
            const transaction = {
                get: (ref) => ref.get(),
                create: (ref, data) => writes.push(['create', ref.path, data]),
                update: (ref, data) => writes.push(['update', ref.path, data])
            };
            const result = await callback(transaction);
            if (this.failNextCommit) {
                this.failNextCommit = false;
                throw new Error('synthetic transaction commit failure');
            }
            for (const [type, path, data] of writes) {
                if (type === 'create' && this.docs.has(path)) throw new Error('already exists');
                this.docs.set(path, { ...(this.docs.get(path) || {}), ...data });
            }
            return result;
        });
        this.queue = run.catch(() => {});
        return run;
    }
}

function persistenceFixture() {
    const now = Date.now();
    const issued = authorization.issueAuthorization(now);
    const db = new MemoryDb({ authorization: issued.record });
    const options = {
        db,
        leadRef: db.ref('lead'),
        authorizationRef: db.ref('authorization'),
        authorizationToken: issued.token,
        isValidAuthorization: (record, token) => authorization.isValidAuthorization(record, token, now),
        uploadSessionRef: null,
        validateUploadSession: () => {},
        uploadConsumedData: {},
        authorizationConsumedData: { consumed: true },
        buildLead: (authorized) => ({
            name: 'Synthetic Lead',
            source: authorization.trustedSource('crm_integration_test', authorized),
            ...(authorized ? { crmIntegrationTestAuthorized: true } : {})
        })
    };
    return { db, options };
}

test('concurrent proof consumption creates one authorized lead and consumes once', async () => {
    const { db, options } = persistenceFixture();
    const results = await Promise.all([
        state.persistLeadWithAuthorization(options),
        state.persistLeadWithAuthorization(options)
    ]);
    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(results.filter((result) => result.duplicate).length, 1);
    assert.equal(db.docs.get('authorization').consumed, true);
    assert.equal(db.docs.get('lead').crmIntegrationTestAuthorized, true);
});

test('transaction failure leaves proof and lead retryable', async () => {
    const { db, options } = persistenceFixture();
    db.failNextCommit = true;
    await assert.rejects(state.persistLeadWithAuthorization(options), /commit failure/);
    assert.equal(db.docs.get('authorization').consumed, false);
    assert.equal(db.docs.has('lead'), false);
    const retried = await state.persistLeadWithAuthorization(options);
    assert.equal(retried.created, true);
    assert.equal(db.docs.get('lead').crmIntegrationTestAuthorized, true);
});

test('lost response after commit recovers as duplicate without proof reuse', async () => {
    const { db, options } = persistenceFixture();
    const committed = await state.persistLeadWithAuthorization(options);
    assert.equal(committed.created, true);
    const retried = await state.persistLeadWithAuthorization({ ...options, authorizationToken: '' });
    assert.deepEqual(retried, { created: false, duplicate: true });
    assert.equal(db.docs.get('lead').crmIntegrationTestAuthorized, true);
});

test('worker readiness survives consumed proof by using persisted authorization', () => {
    const config = {
        enabled: false,
        testSubmissionId: 'canvas-test-submission-0001',
        baseUrl: 'https://crm.example',
        tenantSlug: 'canvas_advertising',
        keyId: 'key',
        secret: 'secret',
        serviceAllowlistConfirmed: true
    };
    const delivery = { leadId: config.testSubmissionId, testAuthorized: true };
    assert.deepEqual(state.readinessForPersistedDelivery(config, delivery, adapter.readiness), {
        ready: true,
        reason: 'ready',
        mode: 'test-only'
    });
    assert.equal(state.readinessForPersistedDelivery(config, { ...delivery, testAuthorized: false }, adapter.readiness).ready, false);
});

test('exact-ID worker recreates a missing outbox after trigger failure', async () => {
    const db = new MemoryDb({ lead: { crmIntegrationTestAuthorized: true } });
    const deliveryRef = db.ref('delivery');
    const leadRef = db.ref('lead');
    let attempts = 0;
    const createDelivery = async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('synthetic trigger failure');
        await state.createOutboxIfAbsent(db, deliveryRef, {
            leadId: 'canvas-test-submission-0001',
            testAuthorized: true,
            serializedBody: '{"externalDocId":"canvas-test-submission-0001"}',
            idempotencyKey: 'canvas-lead:canvas-test-submission-0001'
        });
    };
    await assert.rejects(state.recoverExactTestOutbox({ deliveryRef, leadRef, createDelivery }), /trigger failure/);
    assert.equal(db.docs.has('delivery'), false);
    const recovered = await state.recoverExactTestOutbox({ deliveryRef, leadRef, createDelivery });
    assert.equal(recovered.exists, true);
    assert.equal(recovered.data().testAuthorized, true);
    assert.equal(attempts, 2);
});

