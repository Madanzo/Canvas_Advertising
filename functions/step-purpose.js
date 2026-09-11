'use strict';
// Explicit step-to-purpose mapping. Trusted Functions environment only.
//
// Resolution order, most authoritative first:
//
//   1. a step's own `purpose`     — declared precedence
//   2. this table, by workflow ID AND STEP INDEX
//   3. the origin fallback        — for workflows this table does not name
//   4. undefined                  — never CRM-owned, and never sent
//
// WHY A TABLE AND NOT A RULE. The obvious shortcut is "a lead-triggered
// workflow is the lead notification". It is wrong: `wf_welcome` is triggered by
// `form_submit`, but only steps 0-1 acknowledge the lead. Step 2 is the two-day
// follow-up, which stays website-owned and which the CRM has no ladder to
// replace. Deriving purpose from the trigger alone would drop it silently.
//
// The origin fallback below is retained from the other implementation for
// workflows with no row here, but it is a FALLBACK. A row is authoritative,
// because a heuristic that defaults an unrecognised `form_submit` step to
// `lead_received` would hand a new step to the CRM by accident — and the CRM
// has no step to send it with.

const PURPOSES = Object.freeze([
    'lead_received', 'follow_up', 'booking', 'reminder',
    'campaign', 'direct_message', 'project_completion', 'workflow'
]);

// Indexed to the step order in `seedWorkflows`. A workflow whose steps are
// reordered or extended MUST have its row updated in the same change.
const STEP_PURPOSES = Object.freeze({
    wf_welcome: Object.freeze([
        'lead_received',   // 0 email `welcome`                — the acknowledgement
        'lead_received',   // 1 SMS  `sms_welcome`             — the acknowledgement
        'follow_up'        // 2 email `follow_up_no_response` @2d — WEBSITE-OWNED
    ]),
    wf_booking: Object.freeze(['booking', 'booking', 'reminder']),
    wf_project_thanks: Object.freeze(['project_completion', 'project_completion'])
});

/** The origin fallback: only reached when the table has no row. */
function purposeFromOrigin(origin, step) {
    if (step.type !== 'email' && step.type !== 'sms') return 'workflow';
    if (origin === 'campaign') return 'campaign';
    if (origin === 'booking') return step.relativeTo === 'event' || step.templateId === 'booking_reminder_2h' ? 'reminder' : 'booking';
    if (origin === 'status_change') return 'project_completion';
    if (origin === 'form_submit') return step.templateId === 'follow_up_no_response' ? 'follow_up' : 'lead_received';
    return undefined; // Unknown origin must not bypass a receipt gate.
}

function stepPurpose(origin, step, workflowId, stepIndex) {
    if (!step || typeof step !== 'object') return undefined;
    if (step.type !== 'email' && step.type !== 'sms') return 'workflow';

    // The SERVER-CONTROLLED resolution comes first: the table where this
    // workflow is named, otherwise the origin heuristic.
    const row = STEP_PURPOSES[workflowId];
    const authoritative = Array.isArray(row)
        // A row is exhaustive. An index it does not cover is an unmapped step,
        // and must NOT fall through to the origin heuristic -- for a
        // `form_submit` workflow that returns `lead_received`, so adding a
        // fourth step to wf_welcome would silently hand it to the CRM, which
        // has no step to send it with. Undefined suppresses it instead.
        ? (typeof row[stepIndex] === 'string' ? row[stepIndex] : undefined)
        : purposeFromOrigin(origin, step);

    // A DECLARED PURPOSE CAN NEVER ESCAPE THE RECEIPT GATE. Workflow documents
    // live in Firestore and are editable through the admin UI, so `step.purpose`
    // is data, not authority. Letting it relabel a receipt as `follow_up` would
    // bypass suppression and send the acknowledgement the CRM is also sending.
    if (authoritative === 'lead_received') return 'lead_received';
    // Nor can it rescue a step the server-side resolution declined to classify.
    if (authoritative === undefined) return undefined;
    // Elsewhere it may refine among website-owned purposes, which changes who
    // sends nothing -- every one of them is the website's either way.
    if (typeof step.purpose === 'string' && PURPOSES.includes(step.purpose.trim())) return step.purpose.trim();
    return authoritative;
}

module.exports = { PURPOSES, STEP_PURPOSES, stepPurpose, purposeFromOrigin };
