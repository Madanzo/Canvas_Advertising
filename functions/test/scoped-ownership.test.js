'use strict';
// Scoped ownership: the CRM takes `lead_received` and NOTHING else.
//
// The assertion that matters in this file is not that the acknowledgement
// stops. It is that everything else KEEPS GOING — the two-day follow-up,
// booking confirmations, reminders, campaigns and direct messages. Proving what
// does not stop is the point, because the failure mode of getting this wrong is
// silence, and silence raises no error.

const test = require('node:test');
const assert = require('node:assert/strict');
const policy = require('../communications-policy');
const stepPurpose = require('../step-purpose');

const P = stepPurpose.PURPOSES;
const now = new Date('2026-09-11T00:00:00Z');

const readyEnv = {
    CANVAS_NOTIFICATION_OWNER: 'crm',
    CANVAS_COMMUNICATIONS_TRANSITION_ID: 'transition_fixture',
    CANVAS_COMMUNICATIONS_CUTOVER_AT: '2026-09-10T00:00:00Z',
    CANVAS_CRM_OWNED_PURPOSES: 'lead_received',
    ...Object.fromEntries(policy.GATES.map(k => [
        'CRM_COMMUNICATIONS_' + k.replace(/[A-Z]/g, c => '_' + c).toUpperCase(), 'true'
    ]))
};
const cfg = (over = {}) => policy.configFromEnv({ ...readyEnv, ...over });
const websiteCfg = () => policy.configFromEnv({});

// A lead captured after the cutover, stamped crm by the website's own policy.
const crmLead = () => ({ communications: policy.capture(cfg(), now, false) });
const legacyLead = () => ({});

test('the explicit mapping does NOT treat a lead-triggered workflow as all lead_received', () => {
    // wf_welcome is triggered by form_submit, but only steps 0-1 acknowledge.
    assert.deepEqual(
        stepPurpose.purposesOfWorkflow('wf_welcome', [{}, {}, {}]),
        [P.LEAD_RECEIVED, P.LEAD_RECEIVED, P.LEAD_FOLLOWUP]
    );
    // Step 3 is the two-day follow-up. Nothing on the CRM replaces it.
    assert.notEqual(stepPurpose.purposeOfStep('wf_welcome', 2, {}), P.LEAD_RECEIVED);
    // A step may declare its own purpose, which wins over the table.
    assert.equal(stepPurpose.purposeOfStep('wf_welcome', 0, { purpose: 'campaign' }), 'campaign');
    // Anything unrecognised is never CRM-owned, so the website keeps sending.
    assert.equal(stepPurpose.purposeOfStep('wf_unknown', 0, {}), P.UNCLASSIFIED);
    assert.equal(policy.crmOwnsPurpose(cfg(), P.UNCLASSIFIED), false);
});

test('initial notification is suppressed for a crm-stamped lead', () => {
    assert.equal(policy.websiteAllowed(cfg(), crmLead(), P.LEAD_RECEIVED), false);
    assert.equal(policy.crmOwnsPurpose(cfg(), P.LEAD_RECEIVED), true);
});

test('LATER WEBSITE-OWNED STEPS STILL RUN — the whole point', () => {
    const lead = crmLead();
    for (const purpose of [P.LEAD_FOLLOWUP, P.BOOKING_CONFIRMED, P.BOOKING_REMINDER,
                           P.PROJECT_THANKS, P.CAMPAIGN, P.DIRECT_MESSAGE, P.UNCLASSIFIED]) {
        assert.equal(policy.websiteAllowed(cfg(), lead, purpose), true,
            `${purpose} must keep sending while the CRM owns only lead_received`);
    }
    // Same for a legacy record with no capture stamp.
    for (const purpose of [P.LEAD_FOLLOWUP, P.BOOKING_CONFIRMED]) {
        assert.equal(policy.websiteAllowed(cfg(), legacyLead(), purpose), true);
    }
});

test('duplicate prevention: exactly one side owns each purpose', () => {
    // Website-owned config: the website sends the acknowledgement, CRM does not.
    assert.equal(policy.websiteAllowed(websiteCfg(), { communications: policy.capture(websiteCfg(), now) }, P.LEAD_RECEIVED), true);
    assert.equal(policy.crmOwnsPurpose(websiteCfg(), P.LEAD_RECEIVED), false);
    // CRM-owned config: the CRM sends it, the website does not. Never both.
    assert.equal(policy.websiteAllowed(cfg(), crmLead(), P.LEAD_RECEIVED), false);
    assert.equal(policy.crmOwnsPurpose(cfg(), P.LEAD_RECEIVED), true);
    // And never neither for the purposes the CRM does not take.
    assert.equal(policy.websiteAllowed(cfg(), crmLead(), P.BOOKING_CONFIRMED)
              || policy.crmOwnsPurpose(cfg(), P.BOOKING_CONFIRMED), true);
});

test('missing or invalid configuration never hands anything over', () => {
    // No purpose list at all.
    assert.equal(policy.crmOwnsPurpose(cfg({ CANVAS_CRM_OWNED_PURPOSES: '' }), P.LEAD_RECEIVED), false);
    assert.equal(policy.websiteAllowed(cfg({ CANVAS_CRM_OWNED_PURPOSES: '' }), crmLead(), P.LEAD_RECEIVED), true);
    // Whitespace and empty entries are discarded, not treated as a purpose.
    assert.deepEqual(cfg({ CANVAS_CRM_OWNED_PURPOSES: ' , ,  ' }).crmOwnedPurposes, []);
    assert.deepEqual(cfg({ CANVAS_CRM_OWNED_PURPOSES: ' lead_received , ' }).crmOwnedPurposes, ['lead_received']);
    // A purpose listed while the transition is NOT ready is not owned: every
    // readiness gate still has to hold.
    for (const key of policy.GATES) {
        const broken = cfg({ ['CRM_COMMUNICATIONS_' + key.replace(/[A-Z]/g, c => '_' + c).toUpperCase()]: 'false' });
        assert.equal(policy.crmOwnsPurpose(broken, P.LEAD_RECEIVED), false, key);
    }
    for (const over of [{ CANVAS_COMMUNICATIONS_TRANSITION_ID: '' },
                        { CANVAS_COMMUNICATIONS_CUTOVER_AT: 'invalid' },
                        { CANVAS_NOTIFICATION_OWNER: 'website' }]) {
        assert.equal(policy.crmOwnsPurpose(cfg(over), P.LEAD_RECEIVED), false);
    }
    // A near-miss string is not the purpose.
    assert.equal(policy.crmOwnsPurpose(cfg({ CANVAS_CRM_OWNED_PURPOSES: 'lead_receive' }), P.LEAD_RECEIVED), false);
});

test('rollback restores the acknowledgement and flushes nothing', () => {
    const lead = crmLead();                       // stamp stays crm — never rewritten
    assert.equal(policy.websiteAllowed(cfg(), lead, P.LEAD_RECEIVED), false);
    // Emptying the purpose list is the scoped rollback.
    assert.equal(policy.websiteAllowed(cfg({ CANVAS_CRM_OWNED_PURPOSES: '' }), lead, P.LEAD_RECEIVED), true);
    // Reverting the owner is the broader one.
    assert.equal(policy.websiteAllowed(cfg({ CANVAS_NOTIFICATION_OWNER: 'website' }), lead, P.LEAD_RECEIVED), true);
    // Neither rollback altered the lead's stored capture stamp.
    assert.deepEqual(lead.communications, crmLead().communications);
    // deliveryHold still refuses to release a crm-stamped record once the
    // transition is rolled back: held work stays held rather than draining.
    assert.equal(policy.deliveryHold(cfg({ CANVAS_NOTIFICATION_OWNER: 'website' }), lead.communications), 'communications-owner-mismatch');
    assert.equal(policy.deliveryHold(cfg({ CANVAS_COMMUNICATIONS_TRANSITION_ID: 'different_epoch' }), lead.communications), 'communications-owner-mismatch');
});

test('global stops still stop everything, scoped or not', () => {
    for (const purpose of [P.LEAD_RECEIVED, P.LEAD_FOLLOWUP, P.BOOKING_CONFIRMED, P.DIRECT_MESSAGE]) {
        assert.equal(policy.websiteAllowed(cfg({ CANVAS_WEBSITE_COMMUNICATIONS_PAUSED: 'true' }), crmLead(), purpose), false, purpose);
        assert.equal(policy.websiteAllowed(cfg(), { ...crmLead(), crmIntegrationTestAuthorized: true }, purpose), false, purpose);
        // An explicitly HELD capture is an unresolved-ownership state, not an
        // inference, and it keeps blocking every purpose. Narrowing that is a
        // separate decision, recorded as a remaining gate.
        const held = { communications: policy.capture(cfg({ CRM_COMMUNICATIONS_SMS_READY: 'false' }), now) };
        assert.equal(held.communications.notificationOwner, 'held');
        assert.equal(policy.websiteAllowed(cfg(), held, purpose), false, purpose);
        // A suppressed controlled test stays suppressed on every purpose.
        assert.equal(policy.websiteAllowed(cfg(), { communications: policy.capture(cfg(), now, true) }, purpose), false, purpose);
    }
});

test('the two-argument call is byte-for-byte the ORIGINAL gate', () => {
    // Any call site this change failed to update stays conservative.
    const crm = policy.capture(cfg(), now), website = policy.capture(websiteCfg(), now);
    assert.equal(policy.websiteAllowed({ owner: 'website' }, { communications: crm }), false);
    assert.equal(policy.websiteAllowed({ owner: 'website' }, { communications: website }), true);
    assert.equal(policy.websiteAllowed(cfg(), {}), false);
    assert.equal(policy.websiteAllowed({ owner: 'website', websitePaused: true }, { communications: website }), false);
});
