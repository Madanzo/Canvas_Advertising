'use strict';
// Trusted Functions environment only. Never merge request data into this policy.
const GATES = ['intakeReady', 'emailReady', 'smsReady', 'consentReady', 'idempotencyReady', 'suppressionReady'];
function configFromEnv(env) {
    return {
        owner: env.CANVAS_NOTIFICATION_OWNER || 'website',
        transitionId: env.CANVAS_COMMUNICATIONS_TRANSITION_ID || '',
        cutoverAt: env.CANVAS_COMMUNICATIONS_CUTOVER_AT || '',
        websitePaused: env.CANVAS_WEBSITE_COMMUNICATIONS_PAUSED === 'true',
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
function websiteAllowed(config, lead) {
    if (config.websitePaused || config.owner !== 'website' || !lead || lead.crmIntegrationTestAuthorized === true) return false;
    const stamp = lead.communications;
    // Legacy records retain current policy while inactive; no mutation or replay is performed.
    return !stamp || (stamp.communicationPolicyVersion === 1 && stamp.notificationOwner === 'website' && stamp.testSuppressed !== true);
}
function deliveryHold(config, stamp) {
    if (stamp?.notificationOwner === 'held') return 'communications-transition-not-ready';
    if (stamp?.notificationOwner === 'crm') {
        if (!ready(config) || stamp.transitionId !== config.transitionId || stamp.communicationPolicyVersion !== 1
            || !Number.isFinite(Date.parse(stamp.capturedAt)) || Date.parse(stamp.capturedAt) < Date.parse(config.cutoverAt)) return 'communications-owner-mismatch';
    } else if (config.owner !== 'website') return 'historical-ownership-not-authorized';
    return null;
}
module.exports = { GATES, configFromEnv, ready, capture, websiteAllowed, deliveryHold };
