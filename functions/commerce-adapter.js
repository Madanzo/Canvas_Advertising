'use strict';

const { createHash, randomBytes } = require('node:crypto');
const hash = (s) => createHash('sha256').update(s).digest('hex');
const identifier = /^[A-Za-z0-9_-]{1,100}$/;
const customerOperations = new Set(['catalog', 'quote', 'checkout', 'order', 'payment',
    'create-upload', 'complete-upload', 'download', 'reorder', 'decide-proof']);
const mutableOperations = new Set(['quote', 'checkout', 'payment', 'create-upload',
    'complete-upload', 'reorder', 'decide-proof']);
const PRIVATE = 'canvas_commerce_private';

class CommerceFailure extends Error {
    constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
function requireCondition(condition, code, status) {
    if (!condition) throw new CommerceFailure(code, status);
}

// These documents have no client allow rule. No browser SDK accesses this store.
// Read decisions first, stage writes afterward (Firestore retries have no side effects).
class FirestoreWebsiteStore {
    constructor(db) { this.db = db; }
    transaction(callback) {
        return this.db.runTransaction(async (raw) => {
            const writes = [];
            const result = await callback({
                get: async (key) => {
                    const snap = await raw.get(this.db.doc(`${PRIVATE}/${key}`));
                    return snap.exists ? snap.data() : null;
                },
                set: (key, value) => writes.push([key, value])
            });
            for (const [key, value] of writes) raw.set(this.db.doc(`${PRIVATE}/${key}`), value);
            return result;
        });
    }
}

async function assertSquareCheckoutAllowed(db) {
    const config = (await db.doc(`${PRIVATE}/config`).get()).data();
    // Preserve the existing flow until an explicitly reviewed cutover. This gates
    // NEW charges only; historical webhooks/refunds must continue to reconcile.
    requireCondition(!config || config.checkoutMode === 'square', 'legacy_checkout_disabled', 503);
}

async function beginSquareCheckout(db) {
    const store = new FirestoreWebsiteStore(db);
    const key = `square_${randomBytes(24).toString('hex')}`;
    await store.transaction(async (tx) => {
        const config = await tx.get('config') || { checkoutMode: 'square', enabled: false };
        requireCondition(config.checkoutMode === 'square' && (config.activeFinixCalls || 0) === 0, 'legacy_checkout_disabled', 503);
        tx.set('config', { ...config, activeSquareCalls: (config.activeSquareCalls || 0) + 1 });
        tx.set(key, { state: 'processing', createdAt: Date.now() });
    });
    return async (providerReference) => store.transaction(async (tx) => {
        const config = await tx.get('config'); const attempt = await tx.get(key);
        if (attempt.state !== 'processing') return;
        // An interrupted/uncertain legacy charge is NEVER expired automatically.
        // Staff must reconcile it before clearing the cutover barrier.
        const known = typeof providerReference === 'string' && providerReference.length > 0;
        tx.set(key, { ...attempt, state: known ? 'responded' : 'unknown', providerReference: known ? providerReference : null, finishedAt: Date.now() });
        if (known) tx.set('config', { ...config, activeSquareCalls: Math.max(0, config.activeSquareCalls - 1) });
    });
}

class WebsiteCommerce {
    constructor({ store, transport, config, clock = Date.now, sendRecovery }) {
        Object.assign(this, { store, transport, config, clock, sendRecovery });
    }
    async gate() {
        const config = await this.config();
        requireCondition(config.enabled === true, 'commerce_disabled', 503);
        // No production Finix mode implemented or accepted by this adapter.
        requireCondition(config.checkoutMode === 'finix_sandbox' && config.legacySquareDisabled === true
            && config.legacyLinksDrained === true && (config.activeSquareCalls || 0) === 0, 'checkout_cutover_pending', 503);
        return config;
    }
    async rate(key, limit) {
        await this.store.transaction(async (tx) => {
            const id = `rate_${hash(key + Math.floor(this.clock() / 60000))}`;
            const old = await tx.get(id);
            requireCondition((old?.count || 0) < limit, 'rate_limited', 429);
            tx.set(id, { count: (old?.count || 0) + 1, expiresAt: this.clock() + 120000 });
        });
    }
    async publicConfiguration() {
        const config = await this.gate();
        return { paymentEnvironment: 'sandbox',
            finixApplicationId: /^AP[A-Za-z0-9]{10,100}$/.test(config.finixApplicationId || '') ? config.finixApplicationId : null,
            termsUrl: typeof config.termsUrl === 'string' && config.termsUrl.startsWith('https://canvas-advertising.com/') ? config.termsUrl : null };
    }
    async claimFinix(operation, customerId, attemptId) {
        const key = `finix_${hash([operation, customerId, attemptId].join(':'))}`;
        await this.store.transaction(async (tx) => {
            const config = await tx.get('config'); const existing = await tx.get(key);
            requireCondition(config?.enabled === true && config.checkoutMode === 'finix_sandbox'
                && config.legacySquareDisabled === true && config.legacyLinksDrained === true
                && (config.activeSquareCalls || 0) === 0, 'checkout_cutover_pending', 503);
            if (!existing) {
                tx.set(key, { state: 'processing', operation, createdAt: this.clock() });
                tx.set('config', { ...config, activeFinixCalls: (config.activeFinixCalls || 0) + 1 });
            }
        });
        return async (response) => this.store.transaction(async (tx) => {
            const config = await tx.get('config'); const attempt = await tx.get(key);
            if (attempt.state === 'responded') return;
            const known = operation === 'checkout' ? response?.ok === true
                : response?.ok === true && ['captured', 'failed'].includes(response.result?.state);
            tx.set(key, { ...attempt, state: known ? 'responded' : 'unknown', updatedAt: this.clock() });
            if (known) tx.set('config', { ...config, activeFinixCalls: Math.max(0, config.activeFinixCalls - 1) });
        });
    }
    async session(cookie, ip = '') {
        await this.gate();
        if (/^[a-f0-9]{64}$/.test(cookie || '')) {
            const old = await this.store.transaction((tx) => tx.get(`session_${hash(cookie)}`));
            if (old && old.expiresAt > this.clock()) return { cookie, customerId: old.customerId, orderId: old.orderId || null };
        }
        await this.rate(`session:${ip}`, 10);
        const next = randomBytes(32).toString('hex');
        const customerId = `guest_${randomBytes(20).toString('hex')}`;
        await this.store.transaction(async (tx) => tx.set(`session_${hash(next)}`,
            { customerId, expiresAt: this.clock() + 90 * 86400000 }));
        return { cookie: next, customerId };
    }
    async principal(cookie) {
        requireCondition(/^[a-f0-9]{64}$/.test(cookie || ''), 'session_required', 401);
        const session = await this.store.transaction((tx) => tx.get(`session_${hash(cookie)}`));
        requireCondition(session && session.expiresAt > this.clock(), 'session_expired', 401);
        return session;
    }
    async call(cookie, operation, serializedBody, attemptId) {
        await this.gate();
        requireCondition(customerOperations.has(operation), 'operation_forbidden', 403);
        const principal = await this.principal(cookie);
        const customerId = principal.customerId;
        await this.rate(`customer:${customerId}`, 100);
        if (serializedBody == null && mutableOperations.has(operation) && identifier.test(attemptId || '')) {
            const prior = await this.store.transaction((tx) => tx.get(`intent_${hash([customerId, operation, attemptId].join(':'))}`));
            requireCondition(prior, 'retry_not_found', 404);
            serializedBody = prior.serializedBody;
        }
        requireCondition(typeof serializedBody === 'string' && Buffer.byteLength(serializedBody) <= 128000,
            'invalid_body', 413);
        let body;
        try { body = JSON.parse(serializedBody); } catch { throw new CommerceFailure('invalid_json', 422); }
        requireCondition(body && !Array.isArray(body) && typeof body === 'object', 'invalid_body', 422);
        // Receipt recovery proves ownership of ONE order, not every purchase
        // previously made by the same guest/browser. Scope before cached replay.
        if (principal.orderId) requireCondition(body.orderId === principal.orderId
            && !['checkout', 'quote', 'catalog', 'reorder'].includes(operation), 'recovery_order_scope', 403);
        // Identity, staff/source markers and totals cannot become authorization.
        for (const key of ['customerId', 'tenantId', 'actorId', 'source', 'test', 'suppressNotifications',
            'amount', 'amountMinor', 'merchantId', 'instrumentId', 'capability']) {
            requireCondition(!(key in body), 'forbidden_field', 422);
        }
        if (operation === 'create-upload') requireCondition(body.role === 'source', 'source_upload_only', 403);
        if (operation === 'payment') requireCondition(/^TK[A-Za-z0-9]{10,100}$/.test(body.token || ''), 'invalid_payment_token', 422);
        const mutable = mutableOperations.has(operation);
        let recordKey;
        if (mutable) {
            requireCondition(identifier.test(attemptId || ''), 'attempt_required', 422);
            recordKey = `intent_${hash([customerId, operation, attemptId].join(':'))}`;
            // Persistence BEFORE network I/O. An interrupted worker can resend the
            // original bytes. No lease suppresses a legitimate retry indefinitely.
            const prior = await this.store.transaction(async (tx) => {
                const old = await tx.get(recordKey);
                if (old) {
                    requireCondition(old.serializedBody === serializedBody, 'idempotency_conflict', 409);
                    return old;
                }
                const next = { customerId, operation, attemptId, serializedBody, status: 'pending', createdAt: this.clock() };
                tx.set(recordKey, next);
                return next;
            });
            // Payment success envelopes can be pending/unknown/authorized; exact
            // retries MUST reach CRM for provider reconciliation. Upload URLs also
            // expire, and proof decisions must revalidate current artwork hashes.
            if (prior.status === 'accepted' && ['checkout', 'reorder'].includes(operation)) return prior.response;
            // Read directly from the persisted intent, not a reconstructed JSON object.
            serializedBody = prior.serializedBody;
        }
        const sessionBody = JSON.stringify({ customerId, ...((principal.orderId || body.orderId)
            ? { orderId: principal.orderId || body.orderId } : {}) });
        const finishFinix = ['checkout', 'payment'].includes(operation)
            ? await this.claimFinix(operation, customerId, attemptId) : null;
        let response;
        try {
            const capability = await this.transport('session', sessionBody, null);
            requireCondition(capability.ok === true && typeof capability.result?.token === 'string', 'crm_session_unavailable', 503);
            response = await this.transport(operation, serializedBody, capability.result.token);
        } finally {
            if (finishFinix) await finishFinix(response);
        }
        if (response.ok === true && mutable) {
            await this.store.transaction(async (tx) => {
                const prior = await tx.get(recordKey);
                requireCondition(prior?.serializedBody === serializedBody, 'idempotency_conflict', 409);
                tx.set(recordKey, { ...prior, status: 'accepted', response, acceptedAt: this.clock() });
                if (operation === 'checkout') {
                    tx.set(`order_${hash(response.result.id)}`, { customerId, orderId: response.result.id,
                        email: body.contact.email, createdAt: this.clock() });
                }
            });
        }
        return response;
    }
    async requestRecovery(orderId, email, ip) {
        await this.gate();
        requireCondition(identifier.test(orderId || '') && typeof email === 'string' && email.length <= 254,
            'invalid_recovery', 422);
        requireCondition(this.sendRecovery, 'recovery_email_not_configured', 503);
        await this.rate(`recovery:${ip}`, 3);
        const order = await this.store.transaction((tx) => tx.get(`order_${hash(orderId)}`));
        // Never disclose whether the order/email exists. Send only to the saved recipient.
        if (order && order.email.toLowerCase() === email.toLowerCase()) {
            const token = randomBytes(32).toString('hex');
            await this.store.transaction(async (tx) => tx.set(`recovery_${hash(token)}`, {
                customerId: order.customerId, orderId, expiresAt: this.clock() + 15 * 60000,
                sessionCookie: null
            }));
            await this.sendRecovery({ email: order.email, token, orderId });
        }
        return { ok: true, result: { requested: true } };
    }
    async recover(token) {
        await this.gate();
        requireCondition(/^[a-f0-9]{64}$/.test(token || ''), 'invalid_recovery', 401);
        // Atomic consume AND session persistence. Repeating a lost committed
        // response returns the same cookie during the short recovery window.
        return this.store.transaction(async (tx) => {
            const key = `recovery_${hash(token)}`;
            const recovery = await tx.get(key);
            requireCondition(recovery && recovery.expiresAt > this.clock(), 'recovery_expired', 401);
            const cookie = recovery.sessionCookie || randomBytes(32).toString('hex');
            tx.set(`session_${hash(cookie)}`, { customerId: recovery.customerId, orderId: recovery.orderId,
                expiresAt: this.clock() + 90 * 86400000 });
            tx.set(key, { ...recovery, sessionCookie: cookie });
            return { cookie, orderId: recovery.orderId };
        });
    }
}

function crmTransport({ baseUrl, credential, fetchImpl = fetch }) {
    const url = new URL(baseUrl);
    requireCondition(url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
        && url.pathname === '/api/v1/tenants/canvas_advertising/commerce/',
        'crm_endpoint_not_configured', 503);
    requireCondition(credential && credential.startsWith('mk_live_'), 'crm_credential_not_configured', 503);
    return async (operation, serializedBody, capability) => {
        const response = await fetchImpl(new URL(operation, url), {
            method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25000),
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${capability || credential}` },
            body: serializedBody
        });
        let envelope;
        try { envelope = await response.json(); } catch { throw new CommerceFailure('crm_invalid_response', 502); }
        requireCondition(typeof envelope.ok === 'boolean' && (envelope.ok === false || envelope.version === 'canvas-commerce.v1'),
            'crm_invalid_response', 502);
        Object.defineProperty(envelope, 'httpStatus', { value: response.status });
        return envelope;
    };
}

module.exports = { WebsiteCommerce, FirestoreWebsiteStore, CommerceFailure, crmTransport,
    assertSquareCheckoutAllowed, beginSquareCheckout, hash };
