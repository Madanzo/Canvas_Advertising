'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { WebsiteCommerce, hash } = require('../commerce-adapter');
const { WebsiteMemoryStore } = require('../../scripts/commerce/preview-server.cjs');
const token = 'header.' + Buffer.from(JSON.stringify({ sub: 'staff1' })).toString('base64url') + '.signature';
async function setup() {
    const store = new WebsiteMemoryStore();
    const config = { enabled: true, staffDraftsEnabled: true, checkoutMode: 'finix_sandbox', legacySquareDisabled: true, legacyLinksDrained: true };
    const calls = []; let allowed = true;
    const service = new WebsiteCommerce({ store, config: async () => config, transport: async (op, raw, authorization) => {
        calls.push({ op, raw, authorization });
        return allowed ? { ok: true, result: { id: 'original' } } : { ok: false, code: 'forbidden', httpStatus: 403 };
    } });
    const buyer = await service.session(null);
    return { service, store, config, calls, buyer, revoke: () => { allowed = false; } };
}
test('staff default off, unknown operations and missing token cannot reach transport', async () => {
    const s = await setup(); s.config.staffDraftsEnabled = false;
    await assert.rejects(s.service.staffCall(token, 'staff-quote', '{}', 'one'), /staff_drafts_disabled/);
    s.config.staffDraftsEnabled = true;
    await assert.rejects(s.service.staffCall(null, 'staff-quote', '{}', 'one'), /staff_token_required/);
    await assert.rejects(s.service.staffCall(token, 'staff-release', '{}', 'one'), /operation_forbidden/);
    assert.equal(s.calls.length, 0);
});
test('staff exact bytes persist before delivery; refreshed token and new worker resume without caching authorization', async () => {
    const s = await setup(); const original = s.service.transport; let fail = true;
    const raw = ' {"contactId":"one", "quote":{"requestId":"one"}}';
    s.service.transport = async (op, body, auth) => {
        if (op === 'staff-quote') {
            assert.equal([...s.store.data.values()].find((v) => v.operation === op).serializedBody, raw);
            if (fail) { fail = false; throw Error('interrupted'); }
        }
        return original(op, body, auth);
    };
    await assert.rejects(s.service.staffCall(token, 'staff-quote', raw, 'one'), /interrupted/);
    const worker = new WebsiteCommerce({ store: s.store, config: s.service.config, transport: s.service.transport });
    await worker.staffCall(token.replace('signature', 'refreshed'), 'staff-quote', null, 'one');
    assert.equal(s.calls.find((c) => c.op === 'staff-quote').raw, raw);
    await assert.rejects(worker.staffCall(token, 'staff-quote', JSON.stringify(JSON.parse(raw)), 'one'), /idempotency_conflict/);
    s.revoke(); assert.equal((await worker.staffCall(token, 'staff-quote', null, 'one')).ok, false);
    assert.ok(!JSON.stringify([...s.store.data]).includes(token));
});
test('buyer assignment derives identity from private session, binds ticket+intent atomically and permits exact retries', async () => {
    const s = await setup();
    const { result: ticket } = await s.service.buyerTicket(s.buyer.cookie);
    await assert.rejects(s.service.staffCall(token, 'staff-assign-draft', JSON.stringify({ buyerTicket: ticket.ticket }), 'invalid'), /invalid_buyer_ticket/);
    assert.equal(s.store.data.get('buyer_' + hash(ticket.ticket)).binding, null);
    const input = JSON.stringify({ quoteId: 'q1', quoteHash: 'a'.repeat(64), requestId: 'assign1', buyerTicket: ticket.ticket });
    await Promise.all([1, 2].map(() => s.service.staffCall(token, 'staff-assign-draft', input, 'assign1')));
    const sent = s.calls.filter((c) => c.op === 'staff-assign-draft');
    assert.equal(sent.length, 2); assert.equal(sent[0].raw, sent[1].raw);
    assert.equal(JSON.parse(sent[0].raw).customerId, s.buyer.customerId);
    const record = s.store.data.get('buyer_' + hash(ticket.ticket)); assert.ok(record.binding);
    await s.service.staffCall(token, 'staff-assign-draft', null, 'assign1');
    await assert.rejects(s.service.staffCall(token, 'staff-assign-draft', input, 'assign2'), /buyer_ticket_unavailable/);
    await assert.rejects(s.service.staffCall(token, 'staff-assign-draft', JSON.stringify({ customerId: 'forged' }), 'forged'), /forbidden_field/);
    assert.ok(!JSON.stringify([...s.store.data]).includes(ticket.ticket));
});
test('failed assignment persistence does not consume buyer ticket or leave intent permanently unretryable', async () => {
    const s = await setup(); const { result: ticket } = await s.service.buyerTicket(s.buyer.cookie);
    const original = s.store.transaction.bind(s.store); let fail = true;
    s.store.transaction = (callback) => original(async (tx) => {
        const result = await callback({ ...tx, set: (key, value) => {
            tx.set(key, value);
            if (fail && key.startsWith('staff_intent_')) { fail = false; throw Error('transaction_failure'); }
        } }); return result;
    });
    const raw = JSON.stringify({ quoteId: 'q1', quoteHash: 'a'.repeat(64), requestId: 'assign', buyerTicket: ticket.ticket });
    await assert.rejects(s.service.staffCall(token, 'staff-assign-draft', raw, 'assign'), /transaction_failure/);
    assert.equal(s.store.data.get('buyer_' + hash(ticket.ticket)).binding, null);
    await s.service.staffCall(token, 'staff-assign-draft', raw, 'assign');
    assert.ok(s.store.data.get('buyer_' + hash(ticket.ticket)).binding);
});
