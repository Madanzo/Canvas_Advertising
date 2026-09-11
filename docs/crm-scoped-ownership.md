# Scoped ownership — the CRM takes `lead_received`, and only that

Review branch `codex/canvas-scoped-ownership`, based on
`cc19a5427f8cf0058f2369fb3d506e5f034fdfe6`. **Review implementation only.** No
deployment, no owner change, no enablement, no real sends, no historical replay.
`CANVAS_CRM_OWNED_PURPOSES` is unset everywhere, so nothing below is active.

## The problem this fixes

`websiteAllowed(config, lead)` returned false whenever `config.owner !== 'website'`,
and it gates four call sites: `enrollContactInWorkflow`, `sendEmail`, `sendSMS`
and `onNewLead`. Ownership was therefore all-or-nothing. Setting
`CANVAS_NOTIFICATION_OWNER=crm` would not have handed over the lead
acknowledgement — it would have silenced booking confirmations, appointment
reminders, the two-day follow-up, campaigns and direct messages, none of which
the CRM implements. Four categories of customer message would stop here, never
start there, and raise no error.

## Explicit step-to-purpose mapping

**A step's purpose is declared, never inferred from the workflow's trigger.**
`wf_welcome` is triggered by `form_submit`, but only its first two steps
acknowledge the lead. Suppressing by trigger would also drop step 3.

`functions/step-purpose.js`:

| Workflow | Step | Template | Purpose | Owner when CRM owns `lead_received` |
|---|---|---|---|---|
| `wf_welcome` | 0 | `welcome` (email, @0) | `lead_received` | **CRM** |
| `wf_welcome` | 1 | `sms_welcome` (SMS, @2 min) | `lead_received` | **CRM** |
| `wf_welcome` | 2 | `follow_up_no_response` (email, @2 days) | `lead_followup` | **website** |
| `wf_booking` | 0 | `booking_confirmed` (email, @0) | `booking_confirmed` | website |
| `wf_booking` | 1 | `sms_booking_confirmed` (SMS, @0) | `booking_confirmed` | website |
| `wf_booking` | 2 | `sms_booking_confirmed` (SMS, @2 h before) | `booking_reminder` | website |
| `wf_project_thanks` | 0 | `thank_you_post_project` | `project_thanks` | website |
| `wf_project_thanks` | 1 | `sms_thank_you` | `project_thanks` | website |
| — | — | `sendDirectMessage` | `direct_message` | website |
| anything unrecognised | — | — | `website_unclassified` | website |

Resolution order: a step's own `purpose` field wins; then the table, by
workflow **and index**; then `website_unclassified`, which is never CRM-owned.

**A workflow whose steps are reordered or edited must have its row updated in
the same change.** The mapping is by index, and a silent reorder would
mis-assign ownership.

## How ownership is decided

```js
crmOwnsPurpose(config, purpose) = ready(config) && config.crmOwnedPurposes.includes(purpose)
```

Both halves are required — the same two-part test the CRM applies on its side
(policy `enabled`/`readinessApproved`/`notificationOwner === 'crm'`, **and**
`ownedPurposes` includes it). `CANVAS_CRM_OWNED_PURPOSES` is a comma-separated
list; empty means the CRM owns nothing, which is the default and the rollback
position.

`websiteAllowed` has **two paths, deliberately**. Called with two arguments it
is the original all-or-nothing gate, unchanged — so any call site this change
failed to update stays conservative rather than silently opening up. Called with
a purpose it is scoped. Eight existing policy assertions cover the two-argument
path and were not modified.

A `crm`-stamped lead is no longer excluded from every message: its
acknowledgement belongs to the CRM, its two-day follow-up still belongs here.
`held` continues to block every purpose — it is an explicit "ownership
unresolved" state, not an inference, and narrowing it is a separate decision
(see gates).

## Queued steps: no replay, no payload rewriting

**Purpose is derived at execution time from the workflow definition and the
step index. It is never stored on the instance.** So existing `workflowContacts`
documents need no migration: their `currentStepIndex`, `nextExecutionAt`,
`smsEnrollment` and history are untouched by the handover, and none of their
bytes are rewritten.

A suppressed step returns `{ success: true, skipped: true }`, so `processInstance`
**advances** to the next step and schedules it normally. Returning a failure
would park the instance in `error` and strand every later website-owned step —
the exact silent-drop this change exists to prevent. Proven by execution, not
by reading.

`enrollContactInWorkflow` enrols when **any** step is still website-owned.
Refusing the whole instance because its first step moved to the CRM would
cancel step 3 along with it.

Nothing sweeps, backfills or re-sends. Rollback re-enables the acknowledgement
for steps the scheduler reaches afterwards on its own cadence; steps suppressed
while the CRM owned them are not re-sent. `deliveryHold` still refuses to
release a `crm`-stamped delivery record after a rollback, so held work stays
held.

## Executed evidence

`npm test` (node:test, `functions/`): **77 passed, 0 failed.**
Baseline at `cc19a54` was **63 passed, 0 failed** — 14 added, none regressed.

- `test/scoped-ownership.test.js` (8) — mapping; suppression; later purposes
  still allowed; duplicate prevention (exactly one side owns each purpose, never
  both, never neither); missing/invalid configuration; rollback; global stops;
  and that the two-argument call is byte-for-byte the original gate.
- `test/scoped-ownership-execution.test.js` (6) — the real `executeWorkflowStep`
  and `processInstance` against a **queued** `wf_welcome` instance carrying no
  purpose field: steps 0 and 1 suppressed without failing the instance, **step 2
  still sends** with `purpose: 'lead_followup'`, the instance advances to index 1
  with a scheduled `nextExecutionAt` and no `error` status, and rollback sends
  nothing by itself.

Transports are stubbed; **zero real sends**. These are unit and source-executed
tests: they do not establish deployed IAM, provider readiness or delivery.

## Remaining gates

1. **Inbound opt-out handling** — unchanged and independent of this work. No
   inbound SMS handler was found in the inspected scope on either side. Required
   before any real CRM SMS send.
2. **`held` blocks every purpose.** A lead stamped `held` gets no follow-up
   either. Retained deliberately; narrowing it is its own decision.
3. **Deployed verification** of the `processBulkCampaign` path, tracked
   separately. Campaign steps resolve to `website_unclassified` here, so this
   change does not alter their behaviour.
4. **Live agreement on the purpose vocabulary** — the strings must match the
   CRM's `ownedPurposes` exactly. `lead_received` is the only one in use.
5. `wf_project_thanks` still has no producer for its `status_change` trigger.
