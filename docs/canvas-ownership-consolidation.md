# Canvas ownership consolidation — preparation only

This branch consolidates `d77e1f722a5554617058b8799dfe186999989631` and `ca915c33aa5e5466ebb2eb5809b5510e676e9047`, both descending from adapter compatibility `cc19a5427f8cf0058f2369fb3d506e5f034fdfe6`. Canonical CRM contract remains `4a58f5a5caf7c81ad3be895bb98fc81e23327612`. Neither original branch is rewritten. This document supersedes the activation/rollback implications of both earlier ownership documents.

## Decisions and provenance

| Area | Decision |
| --- | --- |
| Original receipt owner | Retain d77 immutable server capture, never ca915's current-config reassignment on rollback. |
| Configuration | Retain d77 strict JSON `CANVAS_CRM_OWNED_PURPOSES=["lead_received"]`, readiness and UTC validation. Reject ca915 comma-list/global-owner interpretation. |
| Purpose table | Incorporate ca915's explicit mapping approach and per-step test scenarios. Match server origin + exact type/template, not mutable index or step-provided purpose. Only lead_received crosses to CRM. |
| Website vocabulary | Retain d77 follow_up, booking, reminder, campaign, direct_message, project_completion, workflow. ca915 lead_followup/booking_confirmed/booking_reminder/project_thanks are semantic counterparts, not new wire fields. |
| Fallback | Unknown => `unknown_communication_purpose`, no provider, no job advancement, structured refusal log. No permissive website_unclassified fallback and no arbitrary form-submit template inferred as receipt. |
| Legacy work | Add explicit server capture + enrollment eligibility. Ownership alone grants no queue authorization. |
| Dependency artifacts | Exclude ca915 accidentally tracked functions/node_modules symlink. Preserve source commits and exact comparisons as provenance. |
| Tests | Retain d77 suites; adapt their eligible fixtures to explicit grants. Add actual worker/refusal/recovery cases rather than retaining ca915 assertions that rollback may resend a CRM receipt. |

## Exhaustive reviewed mapping

`communications-policy.STEP_PURPOSES` is the authority. `form_submit`: email welcome / SMS sms_welcome => lead_received; email follow_up_no_response => follow_up. `booking`: email booking_confirmed and SMS sms_booking_confirmed => booking; event-relative messages and booking_reminder_2h (email or SMS) => reminder. `status_change`: email thank_you_post_project and SMS sms_thank_you => project_completion. Server-invoked campaign email/SMS => campaign. Authenticated direct callback => direct_message. Task/delay => workflow. Every other type/template/origin refuses observably. Step purpose/owner fields never override this table. Mappings were checked against the saved workflow inventory, including the extra email reminder and delay steps, without a production reread.

Unknown workflow definitions prevent enrollment with a structured refusal. Unknown existing steps remain byte-identical and do not advance. An operator must correct/review the definition; this is not an implicit send/retry authorization. Canonical CRM agent agreement on this stricter fallback was requested on CAM-223 and remains a coordination gate.

## Historical exclusion

New **server-only** setting `CANVAS_WORKFLOW_ELIGIBLE_FROM` is a strict UTC ISO timestamp, independent of notification ownership. Missing/invalid means no queued work is authorized. On a NEW public capture at/after that boundary, the server writes `communications.workflowEligibility` with version/cutover. Enrollment copies a grant bound to original capture time and cutover. Legacy captures cannot gain a grant by restoring config. Historical instances without that grant cannot gain it through worker resumption.

The actual worker checks eligibility before executing or updating an instance. Final email/SMS helpers reread the workflow instance and source lead and repeat the grant decision before provider access. Refused historical records retain status, bytes, nextExecutionAt, history and step index; `communication_refused` logs record only identity/reason. Existing SMS grant, fresh consent and destination binding still apply. Direct messages are fresh authenticated commands, not queue replays, and retain existing ownership/consent gates.

Eligible post-cutover `wf_welcome` continues past CRM-owned steps 1–2 to the website-owned step 3. Receipt ownership and workflow eligibility are independent. Owner rollback never turns an old receipt into website work. Restoring the same eligibility boundary can only admit originally granted work, not retroactively grant history. Changing the boundary refuses old grants. Never populate grants on historical records.

Only public capture currently issues the new capability. New Cal.com/non-public lead sources without trusted capture metadata are refused, too. **Before resuming booking/campaign workflows, review an authenticated event-specific grant issuer for those sources; do not stamp old leads with the current time.** No Cal.com signature/authentication implementation is invented here. The broader workflow authorization/rules boundary and staff ability to edit workflow instances must be reviewed before production activation; preserved private lead update rules must be deployed/verified independently. No rules change is included.

## Durable receipt recovery

For NEW CRM-owned captures, `receiptObligation` commits in the same transaction as the lead, independent of the asynchronous adapter. It retains original owner/purpose/capture/epoch and starts `unresolved`. A failure before adapter outbox creation therefore cannot erase the obligation. When the adapter creates its immutable delivery, a transaction also stores a separate `receiptReview`: reason, original key, wire-body SHA256 and capture/epoch. Duplicate callbacks do not rewrite any of them. Config restoration alone does not resolve the obligation or reenroll anything. A successful lead response is not receipt evidence.

`receipt-recovery.js` is operator-side preparation tooling, **not a deployed export or runner**. It requires authenticated reviewer authority bound to one lead and approval, computes a read-only evidence request, and can append one idempotent audit record under `canvas_leads/{id}/receiptRecoveryReviews/{approvalId}` using a transaction. Every plan has maySend=false/mayRewrite=false. Missing delivery remains manual review. Repeat approval is idempotent; changed evidence conflicts. No implementation here marks an obligation fulfilled, creates CRM intents or sends anything. Audit timestamps are review timestamps, never substituted for capture timestamps. This subcollection is denied by the existing rules' default deny; production rules verification remains required.

Manual review location: exact Canvas lead document in Firestore, fields receiptObligation / receiptReview, and receiptRecoveryReviews subcollection. The record remains unresolved until the canonical CRM supplies authenticated per-ID receipt/outbox evidence and an approved resolution protocol. Unknown/missing policy, stale epoch, opt-out and controlled-test suppression must remain non-sending refusals. CRM missing-intent recovery needs its owner's implementation, atomic idempotency and audit tests; it must never replay original intake or rewrite its bytes/key. Request posted on CAM-223; not yet accepted or implemented by this Canvas branch.

## Packages and rollback

Use `tools/stage-purpose-overlays.py` offline, then `tools/refresh-purpose-fixtures.py` and the fixture verifier. Two private packages preserve baseline configuration/dependency/template files. No normal checkout deployment is safe. Config-bearing archives remain private; only sanitized source ranges/fingerprints are published.

Project canvas-adnvertising, gen1, us-central1:

- Node20: onNewLead (rollback v27), processBulkCampaign (v16), calcomWebhook (v36), processWorkflowQueue (v23), sendDirectMessage (v18).
- Node22: submitPublicLead (v2), createCrmIntegrationTestAuthorization, onCanvasLeadForCRM, processCrmLeadDeliveryQueue (three new exports; no previous versions).

No new Function target for recovery tooling. Source changes: communications-policy.js, index.js, crm-test-state.js; receipt-recovery.js remains offline. Live provider/config fallback retained. Exclude syncLeadToCRM v6, createLeadUploadSession v3, Hosting (recorded 61df100c11fd1d4f / 2020 assets), rules, indexes, App Check and all other Functions. All five frontend files and existing SMS/legacy helper bytes unchanged. Recorded source baselines require fresh checks before separately authorized deployment.

Before activation, old source/config revisions may be restored under separate approval. Once CRM-owned captures exist, keep purpose-aware and historical-eligibility guards. Set receipt ownership empty for NEW captures; never rewrite existing captures/jobs. Keep unresolved obligations visible. Do not use worker enablement, an index, a changed grant boundary, rewritten statuses or old code as recovery. No broad replay/flush is authorized.

## Validation and remaining gates

Executed counts/CI links belong in the exact-head CAM-223 handoff, not a future-looking source claim. The suite includes actual callback/helper slices, actual split-package Firestore transactions, authentication refusals, current opt-outs, historical active/due refusal, known follow-up progression, immutable retry/conflict, and config-loss obligations/review audit. External notification transports are mocked/forbidden. CRM full HTTP route/suppression integration is still owned by the canonical CRM agent; helper/Canvas tests do not substitute for it.

Remaining: canonical receipt-reconciliation implementation/contract and exhaustive-purpose agreement; authenticated grants for non-public workflows; deployed source/config/IAM and private-rules compatibility; inbound signed opt-out with tenant+E.164 durable suppression checked at CRM dispatch; provider readiness; explicit deployment/test/activation approvals. Exact-head CI must pass before handoff. No activation proposal while these gates remain.

Future test only: one newly authorized, notification-suppressed ID, no file, reserved undeliverable contact, consent false, verifying persistence and identical-byte retry. No production submission performed here.
