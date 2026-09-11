'use strict';
// Trusted Functions environment only. Never merge request data into this policy.
// Re-exported so every consumer reaches the mapping through the policy module
// it already depends on. The table itself lives in step-purpose.js, which is
// where it is documented.
const stepPurpose = require('./step-purpose');

const GATES = ['intakeReady', 'emailReady', 'smsReady', 'consentReady', 'idempotencyReady', 'suppressionReady'];
function configFromEnv(env) {
    return {
        owner: env.CANVAS_NOTIFICATION_OWNER || 'website',
        transitionId: env.CANVAS_COMMUNICATIONS_TRANSITION_ID || '',
        cutoverAt: env.CANVAS_COMMUNICATIONS_CUTOVER_AT || '',
        websitePaused: env.CANVAS_WEBSITE_COMMUNICATIONS_PAUSED === 'true',
        // Per-event handover. Mirrors the CRM policy's `ownedPurposes`; the two
        // sides must agree on the exact strings. Empty means the CRM owns
        // nothing, which is the default and the rollback position.
        crmOwnedPurposes: String(env.CANVAS_CRM_OWNED_PURPOSES || '').split(',').map(s => s.trim()).filter(Boolean),
        ...Object.fromEntries(GATES.map(key => [key, env['CRM_COMMUNICATIONS_' + key.replace(/[A-Z]/g, c => '_' + c).toUpperCase()] === 'true']))
    };
}
function ready(config) {
    return config.owner === 'crm' && /^[A-Za-z0-9_-]{8,80}$/.test(config.transitionId || '')
        && Number.isFinite(Date.parse(config.cutoverAt)) && GATES.every(key => config[key] === true);
}
function capture(config, now = new Date(), testSuppressed = false) {
    const base = { communicationPolicyVersion: 1, capturedAt: now.toISOString(), testSuppressed: testSuppressed === true };
    if (config.owner === 'website') return { ...base, notificationOwner: 'website' };
    if (!ready(config) || now.getTime() < Date.parse(config.cutoverAt)) return { ...base, notificationOwner: 'held', reason: 'communications-transition-not-ready' };
    return { ...base, notificationOwner: 'crm', transitionId: config.transitionId };
}
// The CRM owns a purpose only when the transition is ready AND that exact
// purpose is listed — the same two-part test the CRM applies on its side
// (policy enabled/approved/owner === 'crm', and `ownedPurposes` includes it).
// Either half missing means the website still owns the event.
function crmOwnsPurpose(config, purpose) {
    return ready(config) && Array.isArray(config.crmOwnedPurposes) && config.crmOwnedPurposes.includes(purpose);
}

/**
 * May the website send this message?
 *
 * TWO PATHS, deliberately.
 *
 * Called with two arguments this is the ORIGINAL all-or-nothing gate, byte for
 * byte: `config.owner !== 'website'` suppresses everything. Every existing
 * caller and every existing test keeps its exact behaviour, so a call site this
 * change failed to update stays conservative rather than silently opening up.
 *
 * Called with a `purpose` it is scoped: the blanket owner check is replaced by
 * "does the CRM own THIS event". That is the whole point — flipping the owner
 * must hand over `lead_received` without also silencing booking confirmations,
 * reminders, the follow-up ladder, campaigns and direct messages, none of which
 * the CRM implements.
 *
 * A `crm`-stamped lead is therefore no longer excluded from every message. Its
 * acknowledgement belongs to the CRM; its two-day follow-up still belongs here.
 * `held` still blocks: it is an explicit "ownership is not resolved" state, not
 * an inference, and narrowing it is a separate decision.
 */
function websiteAllowed(config, lead, purpose) {
    if (purpose === undefined) {
        if (config.websitePaused || config.owner !== 'website' || !lead || lead.crmIntegrationTestAuthorized === true) return false;
        const stamp = lead.communications;
        // Legacy records retain current policy while inactive; no mutation or replay is performed.
        return !stamp || (stamp.communicationPolicyVersion === 1 && stamp.notificationOwner === 'website' && stamp.testSuppressed !== true);
    }
    if (config.websitePaused || !lead || lead.crmIntegrationTestAuthorized === true) return false;
    if (crmOwnsPurpose(config, purpose)) return false;
    const stamp = lead.communications;
    if (!stamp) return true;
    if (stamp.communicationPolicyVersion !== 1 || stamp.testSuppressed === true) return false;
    return stamp.notificationOwner !== 'held';
}
function deliveryHold(config, stamp) {
    if (stamp?.notificationOwner === 'held') return 'communications-transition-not-ready';
    if (stamp?.notificationOwner === 'crm') {
        if (!ready(config) || stamp.transitionId !== config.transitionId || stamp.communicationPolicyVersion !== 1
            || !Number.isFinite(Date.parse(stamp.capturedAt)) || Date.parse(stamp.capturedAt) < Date.parse(config.cutoverAt)) return 'communications-owner-mismatch';
    } else if (config.owner !== 'website') return 'historical-ownership-not-authorized';
    return null;
}
module.exports = { GATES, configFromEnv, ready, capture, websiteAllowed, crmOwnsPurpose, deliveryHold,
    PURPOSES: stepPurpose.PURPOSES, purposeOfStep: stepPurpose.purposeOfStep, purposesOfWorkflow: stepPurpose.purposesOfWorkflow };
