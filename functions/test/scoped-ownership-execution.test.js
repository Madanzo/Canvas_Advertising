'use strict';
// Executes the REAL executeWorkflowStep and processInstance against a queued
// wf_welcome instance, using the same source-extraction harness as
// sms-consent.test.js.
//
// What this proves, and why it needed executing rather than reasoning: that
// suppressing step 0 ADVANCES the instance instead of parking it, so step 2 —
// the two-day follow-up, which the CRM does not replace — still runs on its
// original schedule. A suppression that returned a failure would leave the
// instance in `error` and silently strand every later step.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const smsConsent = require('../sms-consent');
const communicationsPolicy = require('../communications-policy');
const source = fs.readFileSync(require.resolve('../index.js'), 'utf8');

const CRM_OWNS_LEAD_RECEIVED = {
    CANVAS_NOTIFICATION_OWNER: 'crm',
    CANVAS_COMMUNICATIONS_TRANSITION_ID: 'transition_fixture',
    CANVAS_COMMUNICATIONS_CUTOVER_AT: '2026-09-10T00:00:00Z',
    CANVAS_CRM_OWNED_PURPOSES: 'lead_received',
    ...Object.fromEntries(communicationsPolicy.GATES.map(k => [
        'CRM_COMMUNICATIONS_' + k.replace(/[A-Z]/g, c => '_' + c).toUpperCase(), 'true'
    ]))
};

// The three real wf_welcome steps, in order, exactly as seedWorkflows defines.
const WF_WELCOME = [
    { type: 'email', templateId: 'welcome', delay: 0, unit: 'minutes' },
    { type: 'sms', templateId: 'sms_welcome', delay: 2, unit: 'minutes' },
    { type: 'email', templateId: 'follow_up_no_response', delay: 2, unit: 'days' }
];

function harness(env) {
    const calls = { emails: [], smses: [], updates: [] };
    const workflow = { enabled: true, name: 'New Form Lead Welcome', steps: WF_WELCOME };
    // A lead captured AFTER the cutover, stamped `crm` by the website's policy.
    const lead = {
        phone: '+15125550123',
        email: 'q@example.invalid',
        productionRequest: { version: 1, smsConsent: true },
        communications: communicationsPolicy.capture(communicationsPolicy.configFromEnv(env), new Date('2026-09-11T00:00:00Z'), false)
    };
    const db = { collection(name) { return {
        doc() { return {
            async get() {
                if (name === 'canvas_workflows') return { exists: true, data: () => workflow };
                return { exists: true, data: () => lead };
            },
            async update(v) { calls.updates.push(v); }
        }; },
        async add(v) { calls.updates.push(v); }
    }; } };
    const context = {
        communicationsPolicy, smsConsent, db, process: { env },
        console: { log() {}, error() {} },
        admin: { firestore: { FieldValue: { serverTimestamp: () => 'timestamp', arrayUnion: (...v) => v },
                              Timestamp: { now: () => 'now', fromMillis: (m) => ({ millis: m }) } } },
        sendEmail: async (a) => { calls.emails.push(a); return { success: true }; },
        sendSMS: async (a) => { calls.smses.push(a); return { success: true }; }
    };
    vm.createContext(context);
    const grab = (name) => { const start = source.indexOf(`async function ${name}(`); return source.slice(start, source.indexOf('\n}', start) + 2); };
    vm.runInContext(`${grab('executeWorkflowStep')}\n${grab('processInstance')}\nthis.execute=executeWorkflowStep;this.processInstance=processInstance;`, context);
    return { context, calls, lead,
        instance: (stepIndex) => ({
            // A QUEUED instance: created before the handover, carrying no
            // purpose field of any kind. Nothing about it is rewritten.
            workflowId: 'wf_welcome', contactId: 'lead_1',
            contactEmail: lead.email, contactPhone: lead.phone, contactName: 'Q',
            currentStepIndex: stepIndex, status: 'active',
            smsEnrollment: smsConsent.enrollment({ steps: WF_WELCOME }, lead, lead.phone).smsEnrollment
        }) };
}

test('step 0 — the lead acknowledgement — is suppressed, and does NOT fail the instance', async () => {
    const h = harness(CRM_OWNS_LEAD_RECEIVED);
    const result = await h.context.execute(WF_WELCOME[0], h.instance(0));
    assert.equal(result.skipped, true);
    assert.equal(result.purpose, 'lead_received');
    // success:true is what makes processInstance advance rather than park.
    assert.equal(result.success, true);
    assert.equal(h.calls.emails.length, 0);
});

test('step 1 — the acknowledgement SMS — is suppressed too', async () => {
    const h = harness(CRM_OWNS_LEAD_RECEIVED);
    const result = await h.context.execute(WF_WELCOME[1], h.instance(1));
    assert.equal(result.skipped, true);
    assert.equal(result.purpose, 'lead_received');
    assert.equal(h.calls.smses.length, 0);
});

test('STEP 2 — THE TWO-DAY FOLLOW-UP — STILL SENDS', async () => {
    // The assertion this whole change exists to make true.
    const h = harness(CRM_OWNS_LEAD_RECEIVED);
    const result = await h.context.execute(WF_WELCOME[2], h.instance(2));
    assert.equal(result.skipped, undefined);
    assert.equal(h.calls.emails.length, 1);
    assert.equal(h.calls.emails[0].templateId, 'follow_up_no_response');
    assert.equal(h.calls.emails[0].options.purpose, 'lead_followup');
});

test('a suppressed step ADVANCES the queued instance and keeps its schedule', async () => {
    const h = harness(CRM_OWNS_LEAD_RECEIVED);
    const doc = { id: 'inst_1', data: () => h.instance(0) };
    await h.context.processInstance(doc);
    const update = h.calls.updates.find(u => u.currentStepIndex !== undefined);
    assert.ok(update, 'the instance must be advanced, not left parked');
    assert.equal(update.currentStepIndex, 1);
    assert.equal(update.status, undefined, 'must not be marked error');
    // Step 1 carries delay 2 minutes, so a nextExecutionAt is scheduled.
    assert.ok(update.nextExecutionAt, 'later steps must stay scheduled');
});

test('with the CRM owning nothing, every step sends as before', async () => {
    const h = harness({ ...CRM_OWNS_LEAD_RECEIVED, CANVAS_CRM_OWNED_PURPOSES: '' });
    assert.equal((await h.context.execute(WF_WELCOME[0], h.instance(0))).skipped, undefined);
    assert.equal((await h.context.execute(WF_WELCOME[2], h.instance(2))).skipped, undefined);
    assert.equal(h.calls.emails.length, 2);
});

test('rollback re-enables the acknowledgement without replaying the queue', async () => {
    const h = harness({ ...CRM_OWNS_LEAD_RECEIVED, CANVAS_CRM_OWNED_PURPOSES: '' });
    await h.context.execute(WF_WELCOME[0], h.instance(0));
    assert.equal(h.calls.emails.length, 1);
    // Rollback sends nothing by itself: only a step the scheduler reaches on
    // its own cadence is executed. No sweep, no backfill, no re-send of the
    // steps that were suppressed while the CRM owned them.
    assert.equal(h.calls.updates.length, 0);
});
