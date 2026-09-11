'use strict';
// Explicit step-to-purpose mapping. Trusted Functions environment only.
//
// WHY THIS FILE EXISTS, AND WHY THE MAPPING IS A TABLE RATHER THAN A RULE.
//
// The CRM is taking over exactly one event, `lead_received`. The obvious
// shortcut is to say "a lead-triggered workflow is the lead notification" and
// suppress the workflow. That is wrong, and expensively so: `wf_welcome` is
// triggered by `form_submit`, but only its first two steps acknowledge the
// lead. Step 3 is the two-day follow-up, which stays website-owned and which
// the CRM has no reminder ladder to replace. Suppressing by trigger would
// silently drop it, and a dropped follow-up raises no error.
//
// So a step's purpose is declared, never inferred from what started the
// workflow. A step may carry its own `purpose`; otherwise this table names it
// per workflow AND per index. Anything unrecognised is UNCLASSIFIED, which is
// never CRM-owned — so the website keeps sending it. That default is
// deliberate: the CRM fails closed to "do not enrol", and the website must fail
// to "still send", or a message stops on both sides with nothing to notice it.

const PURPOSES = Object.freeze({
    LEAD_RECEIVED: 'lead_received',
    LEAD_FOLLOWUP: 'lead_followup',
    BOOKING_CONFIRMED: 'booking_confirmed',
    BOOKING_REMINDER: 'booking_reminder',
    PROJECT_THANKS: 'project_thanks',
    DIRECT_MESSAGE: 'direct_message',
    CAMPAIGN: 'campaign',
    UNCLASSIFIED: 'website_unclassified'
});

// Indexed to the step order in `seedWorkflows`. A workflow whose steps are
// edited must have its row updated here in the same change.
const STEP_PURPOSES = Object.freeze({
    wf_welcome: Object.freeze([
        PURPOSES.LEAD_RECEIVED,   // 0 email `welcome`        — the acknowledgement
        PURPOSES.LEAD_RECEIVED,   // 1 SMS  `sms_welcome`     — the acknowledgement
        PURPOSES.LEAD_FOLLOWUP    // 2 email `follow_up_no_response` @2d — WEBSITE-OWNED
    ]),
    wf_booking: Object.freeze([
        PURPOSES.BOOKING_CONFIRMED,
        PURPOSES.BOOKING_CONFIRMED,
        PURPOSES.BOOKING_REMINDER
    ]),
    wf_project_thanks: Object.freeze([
        PURPOSES.PROJECT_THANKS,
        PURPOSES.PROJECT_THANKS
    ])
});

/** A step's declared purpose wins; then the table; then UNCLASSIFIED. */
function purposeOfStep(workflowId, stepIndex, step) {
    if (step && typeof step.purpose === 'string' && step.purpose.trim()) return step.purpose.trim();
    const row = STEP_PURPOSES[workflowId];
    if (Array.isArray(row) && typeof row[stepIndex] === 'string') return row[stepIndex];
    return PURPOSES.UNCLASSIFIED;
}

/** Every purpose a workflow's steps carry, in step order. */
function purposesOfWorkflow(workflowId, steps) {
    return (Array.isArray(steps) ? steps : []).map((step, index) => purposeOfStep(workflowId, index, step));
}

module.exports = { PURPOSES, STEP_PURPOSES, purposeOfStep, purposesOfWorkflow };
