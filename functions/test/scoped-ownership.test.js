'use strict';
// Consolidated scoped ownership: the CRM takes `lead_received` and nothing else.
//
// Two assertions here replace ones an earlier version of this file got WRONG.
// It asserted that rollback lets the website send the receipt for a CRM-stamped
// lead (a duplicate), and it suppressed the receipt for a historical
// website-stamped lead that the CRM will never enrol (a gap). The persisted
// capture stamp is what prevents both, and that is what is pinned below.

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../communications-policy');
const stepPurpose = require('../step-purpose');

const now = new Date('2026-09-11T00:00:00Z');
const gateEnv = Object.fromEntries(policy.GATES.map(k =>
    ['CRM_COMMUNICATIONS_' + k.replace(/[A-Z]/g, c => '_' + c).toUpperCase(), 'true']));
const ON = {
    CANVAS_COMMUNICATIONS_TRANSITION_ID: 'transition_fixture',
    CANVAS_COMMUNICATIONS_CUTOVER_AT: '2026-09-10T00:00:00.000Z',
    CANVAS_CRM_OWNED_PURPOSES: '["lead_received"]',
    ...gateEnv
};
const cfg = (over = {}) => policy.configFromEnv({ ...ON, ...over });
const off = () => policy.configFromEnv({});

const crmStamped = () => ({ communications: policy.capture(cfg(), now, false) });
const webStamped = () => ({ communications: policy.capture(off(), now, false) });
const legacy = () => ({});

test('the explicit table beats the origin heuristic, and a row is exhaustive', () => {
    const welcome = [
        { type: 'email', templateId: 'welcome' },
        { type: 'sms', templateId: 'sms_welcome' },
        { type: 'email', templateId: 'follow_up_no_response' }
    ];
    assert.deepEqual(welcome.map((s, i) => policy.stepPurpose('form_submit', s, 'wf_welcome', i)),
        ['lead_received', 'lead_received', 'follow_up']);
    // A DECLARED PURPOSE CANNOT ESCAPE THE RECEIPT GATE. Workflow documents are
    // Firestore data editable through the admin UI, so `step.purpose` is data,
    // not authority; relabelling a receipt would bypass suppression and send
    // the acknowledgement the CRM is also sending.
    assert.equal(policy.stepPurpose('form_submit', { type: 'email', purpose: 'booking' }, 'wf_welcome', 0), 'lead_received');
    assert.equal(policy.stepPurpose('form_submit', { type: 'email', templateId: 'welcome', purpose: 'booking' }), 'lead_received');
    // It may refine among website-owned purposes, where every option is ours anyway.
    assert.equal(policy.stepPurpose('form_submit', { type: 'email', purpose: 'campaign' }, 'wf_welcome', 2), 'campaign');
    // An invalid declared purpose is ignored rather than trusted.
    assert.equal(policy.stepPurpose('form_submit', { type: 'email', purpose: 'nonsense' }, 'wf_welcome', 2), 'follow_up');
    // And it cannot rescue a step the server-side resolution declined to classify.
    assert.equal(policy.stepPurpose('form_submit', { type: 'email', purpose: 'follow_up' }, 'wf_welcome', 3), undefined);
    // A NEW step on a named workflow must NOT inherit lead_received from the
    // origin heuristic. This is the accidental-CRM-ownership case.
    assert.equal(policy.stepPurpose('form_submit', { type: 'email', templateId: 'brand_new' }, 'wf_welcome', 3), undefined);
    // Workflows with no row still use the origin fallback.
    assert.equal(policy.stepPurpose('booking', { type: 'sms', relativeTo: 'event' }, 'wf_custom', 0), 'reminder');
    assert.equal(policy.stepPurpose('mystery', { type: 'email' }, 'wf_custom', 0), undefined);
});

test('an unresolved purpose is never CRM-owned and never sent', () => {
    for (const purpose of [undefined, null, '', 'nonsense', 'LEAD_RECEIVED']) {
        assert.equal(policy.websiteAllowed(cfg(), crmStamped(), purpose), false, String(purpose));
        assert.equal(policy.PURPOSES.includes(purpose), false, String(purpose));
    }
});

test('THE STAMP PREVENTS DUPLICATES: a CRM-owned receipt never returns to the website', () => {
    const lead = crmStamped();
    assert.equal(lead.communications.notificationOwner, 'crm');
    assert.equal(policy.websiteAllowed(cfg(), lead, 'lead_received'), false);
    // Rollback by emptying the purpose list, and by every other lever.
    for (const over of [{ CANVAS_CRM_OWNED_PURPOSES: '' }, { CANVAS_CRM_OWNED_PURPOSES: '[]' },
                        { CANVAS_COMMUNICATIONS_TRANSITION_ID: '' }, { CRM_COMMUNICATIONS_SMS_READY: 'false' }]) {
        assert.equal(policy.websiteAllowed(cfg(over), lead, 'lead_received'), false,
            'a receipt the CRM already owned must not be re-sent by the website');
    }
    assert.equal(policy.websiteAllowed(off(), lead, 'lead_received'), false);
    // The stamp itself is never rewritten by any of it.
    assert.deepEqual(lead.communications, crmStamped().communications);
});

test('THE STAMP PREVENTS GAPS: a historical website receipt is never transferred to the CRM', () => {
    const lead = webStamped();
    assert.equal(lead.communications.notificationOwner, 'website');
    // Even with the CRM owning lead_received, this record stays the website's:
    // the CRM would never enrol it (captured before its cutover), so suppressing
    // it here would mean nobody sends.
    assert.equal(policy.websiteAllowed(cfg(), lead, 'lead_received'), true);
    // A legacy record with no stamp likewise keeps its receipt.
    assert.equal(policy.websiteAllowed(cfg(), legacy(), 'lead_received'), true);
});

test('only the receipt moves — every other purpose keeps sending', () => {
    for (const lead of [crmStamped(), webStamped(), legacy()]) {
        for (const purpose of ['follow_up', 'booking', 'reminder', 'campaign', 'direct_message', 'project_completion', 'workflow']) {
            assert.equal(policy.websiteAllowed(cfg(), lead, purpose), true, purpose);
        }
    }
});

test('`held` legacy stamps: the receipt stops, everything else continues', () => {
    // `capture` no longer mints `held`, but records stamped by the previous
    // implementation persist and must still behave predictably.
    const held = { communications: { communicationPolicyVersion: 1, notificationOwner: 'held', capturedAt: now.toISOString(), testSuppressed: false } };
    assert.equal(policy.websiteAllowed(cfg(), held, 'lead_received'), false, 'receipt: ownership unresolved, so no send');
    for (const purpose of ['follow_up', 'booking', 'reminder', 'campaign', 'direct_message', 'project_completion', 'workflow']) {
        assert.equal(policy.websiteAllowed(cfg(), held, purpose), true, purpose);
    }
    // And the delivery queue still refuses to release it.
    assert.equal(policy.deliveryHold(cfg(), held.communications), 'communications-transition-not-ready');
});

test('missing or invalid configuration never hands anything over', () => {
    for (const over of [{ CANVAS_CRM_OWNED_PURPOSES: '' }, { CANVAS_CRM_OWNED_PURPOSES: '[]' },
                        { CANVAS_CRM_OWNED_PURPOSES: 'lead_received' },            // not JSON
                        { CANVAS_CRM_OWNED_PURPOSES: '["lead_received","campaign"]' }, // more than the one
                        { CANVAS_CRM_OWNED_PURPOSES: '["campaign"]' },
                        { CANVAS_CRM_OWNED_PURPOSES: '["lead_receive"]' },         // near miss
                        { CANVAS_COMMUNICATIONS_CUTOVER_AT: 'invalid' },
                        { CANVAS_COMMUNICATIONS_CUTOVER_AT: '2026-09-10' },        // not a full timestamp
                        { CANVAS_COMMUNICATIONS_TRANSITION_ID: 'short' }]) {
        assert.equal(policy.ready(cfg(over)), false, JSON.stringify(over));
        // An unready transition stamps `website`, so the receipt is never lost.
        assert.equal(policy.capture(cfg(over), now).notificationOwner, 'website', JSON.stringify(over));
    }
    for (const key of policy.GATES) {
        const broken = cfg({ ['CRM_COMMUNICATIONS_' + key.replace(/[A-Z]/g, c => '_' + c).toUpperCase()]: 'false' });
        assert.equal(policy.ready(broken), false, key);
        assert.equal(policy.capture(broken, now).notificationOwner, 'website', key);
    }
});

test('global stops still stop everything', () => {
    for (const purpose of policy.PURPOSES) {
        assert.equal(policy.websiteAllowed(cfg({ CANVAS_WEBSITE_COMMUNICATIONS_PAUSED: 'true' }), crmStamped(), purpose), false, purpose);
        assert.equal(policy.websiteAllowed(cfg(), { ...webStamped(), crmIntegrationTestAuthorized: true }, purpose), false, purpose);
        assert.equal(policy.websiteAllowed(cfg(), { communications: policy.capture(cfg(), now, true) }, purpose), false, purpose);
        assert.equal(policy.websiteAllowed(cfg(), null, purpose), false, purpose);
    }
});

test('the capture stamp records its own purpose and is bounded by the cutover', () => {
    assert.equal(policy.capture(cfg(), now).purpose, 'lead_received');
    const before = new Date('2026-09-09T00:00:00Z');
    assert.equal(policy.capture(cfg(), before).notificationOwner, 'website', 'pre-cutover capture stays the website’s');
});
