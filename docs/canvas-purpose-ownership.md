# Canvas lead_received ownership — review only

Parent Canvas head: `cc19a5427f8cf0058f2369fb3d506e5f034fdfe6`. Canonical CRM contract: `4a58f5a5caf7c81ad3be895bb98fc81e23327612` (ownedPurposes). This branch changes Canvas only. It supersedes the global ownership behavior in the earlier communications draft; all earlier branches/evidence remain preserved.

## Ownership and routing

Ownership configuration is server-only and limited to `lead_received`. The legacy `CANVAS_NOTIFICATION_OWNER` value no longer transfers any purpose. A missing/invalid purpose list or incomplete readiness/cutover configuration leaves NEW captures website-owned. An existing server capture keeps its original owner through retries and rollback.

| Server origin / step | Purpose | Owner when new receipt capture is CRM-owned |
| --- | --- | --- |
| form_submit email/SMS, including welcome/sms_welcome and other initial-receipt variants | lead_received | CRM |
| form_submit follow_up_no_response | follow_up | Website |
| booking confirmation | booking | Website |
| booking relative-to-event message or booking_reminder_2h | reminder | Website |
| processBulkCampaign (even using a welcome template) | campaign | Website |
| sendDirectMessage | direct_message | Website |
| status_change message | project_completion | Website |
| task/delay/non-message steps | workflow | Website |

The table covers the saved read-only workflow definition inventory, including the two-day follow-up inside wf_welcome. New/changed template-purpose mappings require review before activation; unknown form-submit message templates conservatively remain receipt steps. This is ownership of a purpose, not a deduplication repair for the existing multiple welcome workflows or booking enrollment paths.

The server callback supplies the enrollment origin. The instance stores that origin; the scheduler derives each step's purpose and passes it explicitly through executeWorkflowStep and sendEmail/sendSMS. A missing helper purpose or unknown message origin cannot authorize a send. Receipt-only workflows are not enrolled for CRM-owned captures. Mixed workflows retain their website-owned follow-up; skipped receipt steps advance normally without resetting delays or rewinding indexes. Existing SMS enrollment grant, fresh consent and recipient binding checks remain intact; no old grant is repaired.

Public submitPublicLead stamps `communications.purpose = lead_received` inside its original server persistence callback. A visitor-provided source="booking" cannot route that request into booking ownership. Unknown ownership/purpose fields are rejected by public validation. Campaign and direct-message handlers hardcode their origin/purpose and ignore caller purpose fields. Controlled-test suppression and the existing explicit emergency website pause still apply to ALL purposes.

The adapter keeps the canonical five-field envelope (`notificationOwner`, `policyVersion`, `transitionId`, original `capturedAt`, `testSuppressed`). It does not send caller-owned policy or ownedPurposes as authority. A new envelope can authorize receipt enrollment only with a matching original server capture purpose and complete server transition configuration. Missing/historical capture metadata yields a valid lead with enrollment suppressed. Existing serialized outbox bodies and idempotency keys are never rewritten; unsuppressed deliveries remain held on ownership/configuration drift.

## Configuration proposal — nothing applied

`CANVAS_CRM_OWNED_PURPOSES` is a JSON array string. Absent or `[]` is the default; the ONLY transferable value is `["lead_received"]`. Malformed JSON, unknown/multiple/duplicate purposes do not transfer ownership. Ownership also requires a valid UTC ISO cutover, valid transition ID, and all six existing readiness gates explicitly true:

- CANVAS_COMMUNICATIONS_TRANSITION_ID
- CANVAS_COMMUNICATIONS_CUTOVER_AT
- CRM_COMMUNICATIONS_INTAKE_READY
- CRM_COMMUNICATIONS_EMAIL_READY
- CRM_COMMUNICATIONS_SMS_READY
- CRM_COMMUNICATIONS_CONSENT_READY
- CRM_COMMUNICATIONS_IDEMPOTENCY_READY
- CRM_COMMUNICATIONS_SUPPRESSION_READY

The CRM tenant-private policy must separately list ownedPurposes=["lead_received"] with the matching transitionId/cutoverAt and pass its own enablement/readiness gates. Nothing in this branch creates or changes that policy. No configuration, enablement, ownership flip or credentials were applied. CANVAS_WEBSITE_COMMUNICATIONS_PAUSED remains an explicit all-purpose emergency pause; this branch does not clear it.

## Prepared live-source overlays

`tools/stage-purpose-overlays.py` performs offline composition only, from preserved verified live source ZIPs. It does not authenticate, contact Firebase or deploy. Two private packages retain every non-index live file, dependency lock, runtime configuration and template byte-for-byte. In particular the deployed SMS provider/config fallback is retained (it differs from the checkout); no SMS delivery repair is included.

Project `canvas-adnvertising`, first-generation Functions, `us-central1`:

| Package/runtime | Exact future targets | Recorded rollback revisions |
| --- | --- | --- |
| SMS / Node 20 | onNewLead, processBulkCampaign, calcomWebhook, processWorkflowQueue, sendDirectMessage | v27, v16, v36, v23, v18 respectively |
| Public/adapter / Node 22 | submitPublicLead; createCrmIntegrationTestAuthorization, onCanvasLeadForCRM, processCrmLeadDeliveryQueue | submitPublicLead v2; three new exports have no prior deployment |

SMS package changes existing index.js and adds communications-policy.js. Public package changes existing index.js and adds communications-policy.js, crm-test-authorization.js, crm-test-state.js, crm-lead-adapter.js and sms-consent.js. The public package includes the previously reviewed integration/mapping/proof chain; it is not solely this branch's incremental diff.

Recorded rollback source ZIP SHA-256:
- SMS: `4429fa07197c8539efe200df5daac69f9d66d18ae469b9bf22778d87bcc78917`.
- Public: `11c3c95913e0c3ddad143336d84f8d691dac01a6933e5fbe76b74fbe80ba549e`.

The release manifest supplies final candidate archive/index fingerprints. Four checked-in fixture ranges are exact candidate package bytes, with separately installed deployed dependency locks. No runtime config or source ZIP is checked in or uploaded to Linear. Stored baseline metadata was last verified 2026-09-10T22:45:00.035Z; it was reused for offline preparation, NOT represented as a fresh live check. Recheck each target's source/config/IAM immediately before any separately approved deployment.

Excluded: syncLeadToCRM v6 and its disabled guard, createLeadUploadSession v3, every other Function, Hosting version 61df100c11fd1d4f and all 2,020 assets, all rules/indexes, App Check initialization/references/enforcement, and CRM source/settings. Five deployed frontend files are unchanged against the reviewed parent. Shared archives contain other exports: never deploy all Functions from them.

## Validation and rollback

Unit/contract tests exercise actual shared helpers with mocked Resend/Plivo transports, purpose classification, missing/invalid configuration, browser overrides, consent denial, mixed workflow enrollment, the unchanged idempotency behavior and the canonical CRM's refusal of unowned purposes. The canonical validator/enrollment fixture is bundled from exact CRM 4a58f5a; readable source and hashes accompany it.

Split-package emulator tests use actual callback/helper bytes, separate deployed Firebase dependency locks and demo Firestore transactions. They verify immutable retries, trusted public capture despite a visitor booking label, selective welcome skipping, preservation of the two-day follow-up, and unchanged persisted held/future records after configuration rollback and a normal queue invocation. No provider transport is allowed in emulator tests. Existing queue queries are unchanged; the missing production index is not created. These tests do not assert that all historical due website jobs would be safe to drain: that remains explicitly forbidden.

Future release order: review the integration → mapping → communications → adapter compatibility → this scoped-purpose chain with canonical CRM 4a58f5a; reconcile fresh live-source baselines; deploy only separately approved packages with ownership list empty and all existing enablement off; validate those inactive deployments; only then consider a separately approved exact-ID suppressed end-to-end test and coordinated purpose transition. No normal checkout deploy is safe.

Rollback before any purpose activation may restore exact recorded source/config/runtime for only the deployed targets. New exports must remain disabled; deleting them requires a separate explicit action. After activation, the first rollback is configuration-only: set the purpose list to [] for NEW captures while retaining this purpose-aware code and the original stamps/queue bytes. Existing CRM-owned receipt steps must never be re-granted to the website. Pause the CRM purpose rather than replaying it if needed. Do NOT restore pre-ownership worker code after CRM-owned captures exist: that code lacks the receipt gate and could duplicate sends. Do not reset instance indexes/statuses, remap outboxes, create indexes or run recovery. A code rollback after cutover requires a guard-preserving package and explicit review.

Remaining release blockers: fresh per-target baseline/config/IAM verification; canonical agreement on the exact purpose/cutover; inherited Storage/private-proof/rules and deployed authentication validation; provider readiness; separately authorized controlled test and rollout. Current historical inventory remains preserved: 218 workflow records, 210 active/due, no SMS enrollment grants; 101/102 leads lack explicit consent, and the remaining lead is not presumed eligible. No historical replay/import/recovery is included.
