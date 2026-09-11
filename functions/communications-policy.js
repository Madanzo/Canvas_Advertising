'use strict';
// Trusted Functions environment only. The legacy global owner flag has no authority.
const GATES = ['intakeReady', 'emailReady', 'smsReady', 'consentReady', 'idempotencyReady', 'suppressionReady'];
const PURPOSES = ['lead_received', 'follow_up', 'booking', 'reminder', 'campaign', 'direct_message', 'project_completion', 'workflow'];
function ownedPurposes(value) {
    try { const items = JSON.parse(value || '[]'); return Array.isArray(items) && items.length === 1 && items[0] === 'lead_received' ? items : []; }
    catch { return []; }
}
function configFromEnv(env) {
    const purposes = ownedPurposes(env.CANVAS_CRM_OWNED_PURPOSES);
    return {
        owner: purposes.includes('lead_received') ? 'crm' : 'website',
        ownedPurposes: purposes,
        transitionId: env.CANVAS_COMMUNICATIONS_TRANSITION_ID || '',
        cutoverAt: env.CANVAS_COMMUNICATIONS_CUTOVER_AT || '',
        websitePaused: env.CANVAS_WEBSITE_COMMUNICATIONS_PAUSED === 'true',
        workflowEligibleFrom: env.CANVAS_WORKFLOW_ELIGIBLE_FROM || '',
        ...Object.fromEntries(GATES.map(key => [key, env['CRM_COMMUNICATIONS_' + key.replace(/[A-Z]/g, c => '_' + c).toUpperCase()] === 'true']))
    };
}
function validTimestamp(value) {
    return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)
        && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === (value.length === 20 ? value.replace('Z', '.000Z') : value);
}
function ready(config) {
    return config.owner === 'crm' && Array.isArray(config.ownedPurposes)
        && config.ownedPurposes.length === 1 && config.ownedPurposes[0] === 'lead_received'
        && /^[A-Za-z0-9_-]{8,80}$/.test(config.transitionId || '')
        && validTimestamp(config.cutoverAt) && GATES.every(key => config[key] === true);
}
function capture(config, now = new Date(), testSuppressed = false) {
    const base = { communicationPolicyVersion: 1, purpose: 'lead_received', capturedAt: now.toISOString(), testSuppressed: testSuppressed === true,
        ...(validTimestamp(config.workflowEligibleFrom) && now.getTime() >= Date.parse(config.workflowEligibleFrom)
            ? { workflowEligibility: { version: 1, cutoverAt: config.workflowEligibleFrom } } : {}) };
    // Incomplete configuration cannot transfer ownership or silence the default owner.
    if (!ready(config) || now.getTime() < Date.parse(config.cutoverAt)) return { ...base, notificationOwner: 'website' };
    return { ...base, notificationOwner: 'crm', transitionId: config.transitionId };
}
function websiteAllowed(config, lead, purpose) {
    if (!PURPOSES.includes(purpose) || config.websitePaused || !lead || lead.crmIntegrationTestAuthorized === true || lead.communications?.testSuppressed === true) return false;
    if (purpose !== 'lead_received') return true;
    const stamp = lead.communications;
    // The original lead-received owner is immutable. Rollback never re-grants
    // website ownership to a CRM/held record, and never rewrites old jobs.
    return !stamp || (stamp.communicationPolicyVersion === 1 && stamp.notificationOwner === 'website');
}
// Consolidates ca915c3's explicit table with d77's trusted origin and immutable owner.
// No step.purpose override, index fallback or unknown-message send fallback.
const STEP_PURPOSES = Object.freeze({
    form_submit: { 'email:welcome': 'lead_received', 'sms:sms_welcome': 'lead_received',
        'email:follow_up_no_response': 'follow_up' },
    booking: { 'email:booking_confirmed': 'booking', 'sms:sms_booking_confirmed': 'booking',
        'sms:booking_reminder_2h': 'reminder', 'email:booking_reminder_2h': 'reminder' },
    status_change: { 'email:thank_you_post_project': 'project_completion', 'sms:sms_thank_you': 'project_completion' }
});
function stepPurpose(origin, step) {
    if (['task', 'delay'].includes(step.type)) return 'workflow';
    if (!['email', 'sms'].includes(step.type)) return undefined;
    if (origin === 'campaign') return 'campaign'; // authenticated server invocation
    const purpose = STEP_PURPOSES[origin]?.[step.type + ':' + step.templateId];
    return purpose && origin === 'booking' && step.relativeTo === 'event' ? 'reminder' : purpose;
}
function workflowGrant(config, lead) {
    const stamp = lead?.communications;
    const cutover = config.workflowEligibleFrom;
    if (!validTimestamp(cutover) || stamp?.workflowEligibility?.version !== 1
        || stamp.workflowEligibility.cutoverAt !== cutover || !validTimestamp(stamp.capturedAt)
        || Date.parse(stamp.capturedAt) < Date.parse(cutover)) return null;
    return { version: 1, cutoverAt: cutover, capturedAt: stamp.capturedAt };
}
function dispatchDecision(config, lead, instance, purpose) {
    if (!PURPOSES.includes(purpose)) return { allowed: false, reason: 'unknown_communication_purpose' };
    const expected = workflowGrant(config, lead), actual = instance?.communicationEligibility;
    if (!expected || !actual || actual.version !== 1 || actual.cutoverAt !== expected.cutoverAt
        || actual.capturedAt !== expected.capturedAt) return { allowed: false, reason: 'workflow_not_authorized' };
    return { allowed: true };
}
function deliveryHold(config, stamp) {
    if (stamp?.notificationOwner === 'held') return 'communications-transition-not-ready';
    if (stamp?.notificationOwner === 'crm' && (!ready(config) || stamp.transitionId !== config.transitionId || stamp.communicationPolicyVersion !== 1
        || !Number.isFinite(Date.parse(stamp.capturedAt)) || Date.parse(stamp.capturedAt) < Date.parse(config.cutoverAt))) return 'communications-owner-mismatch';
    return null;
}
module.exports = { GATES, PURPOSES, STEP_PURPOSES, workflowGrant, dispatchDecision, configFromEnv, ready, capture, websiteAllowed, stepPurpose, deliveryHold };
