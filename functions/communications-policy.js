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
    const base = { communicationPolicyVersion: 1, purpose: 'lead_received', capturedAt: now.toISOString(), testSuppressed: testSuppressed === true };
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
function stepPurpose(origin, step) {
    if (step.type !== 'email' && step.type !== 'sms') return 'workflow';
    if (origin === 'campaign') return 'campaign';
    if (origin === 'booking') return step.relativeTo === 'event' || step.templateId === 'booking_reminder_2h' ? 'reminder' : 'booking';
    if (origin === 'status_change') return 'project_completion';
    if (origin === 'form_submit') return step.templateId === 'follow_up_no_response' ? 'follow_up' : 'lead_received';
    return undefined; // Unknown message origin must not bypass a receipt gate.
}
function deliveryHold(config, stamp) {
    if (stamp?.notificationOwner === 'held') return 'communications-transition-not-ready';
    if (stamp?.notificationOwner === 'crm' && (!ready(config) || stamp.transitionId !== config.transitionId || stamp.communicationPolicyVersion !== 1
        || !Number.isFinite(Date.parse(stamp.capturedAt)) || Date.parse(stamp.capturedAt) < Date.parse(config.cutoverAt))) return 'communications-owner-mismatch';
    return null;
}
module.exports = { GATES, PURPOSES, configFromEnv, ready, capture, websiteAllowed, stepPurpose, deliveryHold };
