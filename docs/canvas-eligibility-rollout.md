# Canvas eligibility precondition and rollout assessment

Review parent: `75bf2e5889417b4453d88d809911bc83571674f1`. CRM proposal reviewed: CAM-223 comment `5e04830e-f594-4560-8391-6d19d54b272a`, CRM `afeae048c04d2b063fb7b5d2310bbb3cc69d3675`. CRM worktree untouched.

## Deployment precondition

The proposed, write-once value is `2026-09-11T00:00:00.000Z`, pinned in `deployment/workflow-eligibility.json`. This is a reviewed configuration proposal, NOT a live change or authorization to send. It is deliberately not generated at deployment. Old records without original server stamps remain ineligible even if their date is after this value.

Why this value: it was selected during the September 11 UTC preparation as a fixed, easy-to-audit start-of-day boundary. It was not derived from a production activation, customer authorization event, or CRM cutover, and midnight has no special authorization meaning. Read-only evidence showed no value deployed and no existing grants to preserve. It remains a proposed constant, not a claim that any record created after midnight is authorized.

The workflow epoch and CRM ownership cutover are independent. CANVAS_WORKFLOW_ELIGIBLE_FROM binds workflow eligibility grants to one stable epoch. CANVAS_COMMUNICATIONS_CUTOVER_AT instead governs whether a new receipt capture may be assigned to CRM, together with ownedPurposes, transition ID and readiness gates. They need not be equal. Changing CRM ownership policy does not mint a workflow grant, and rollback must not rotate the workflow epoch.

The epoch alone cannot authorize a historical record. workflowGrant requires the original server-recorded communications capture timestamp, workflowEligibility version 1 with the identical epoch, and capturedAt at/after that epoch. dispatchDecision additionally requires the instance's matching version/epoch/original capturedAt grant. Browser dates, forwarding time, workflow presence, restoring configuration or an epoch comparison alone are insufficient. Current purpose ownership and SMS consent/enrollment checks still apply before any provider call. Trusted provenance comes from the server capture/enrollment path and protected writes, not from a timestamp or user-editable field by itself.

Firebase Functions predeploy runs `tools/check-workflow-deployment.cjs`. It requires the exact unquoted value in the candidate `.env.canvas-adnvertising`, reads every affected existing Gen1 function in us-central1, and rejects missing, malformed, different, or inconsistent values. The initial rollout therefore refuses until the same value has been staged on all six existing targets by a separately authorized configuration operation. New exports may be absent; if present they must agree. Every page of original capture and instance grant fields is read, including inactive records; conflicting or unsupported grants refuse deployment. No timestamp override or backfill mechanism exists. Existing ADC for the deployment identity and read permissions are prerequisites; the gate cannot create credentials. Missing auth/read access fails closed. Only aggregate counts are printed.

This is a Firebase CLI predeploy gate, not a guard against an administrator bypassing the CLI or concurrently editing configuration. Serialize deployment/configuration operations, recheck immediately before each package, and stop on drift. Use only the prepared package wrappers. Their project-specific dotenv supplies the reviewed value; do not add competing dotenv keys, aliases or runtime overrides. A full checkout deployment remains prohibited.

Read-only live function inventory on 2026-09-11 confirms the value and ownedPurposes are absent from all six current targets. The deployment gate is intentionally NOT satisfied today. No existing stored grants were found. If a grant or previously used different value is discovered later, stop and reconcile the pinned proposal rather than rotate it.

## Read-only workflow inventory

Firestore `canvas-adnvertising/(default)`, Standard edition. Full paginated collection reads (no filters requiring an index), approximately 2026-09-11T04:20:56Z; separate collection reads, not one transactional snapshot. No customer details retained in this report.

- 218 instances: 210 active, 8 cancelled. Every record at step index 0, empty history.
- Active: 104 welcome, 104 legacy definitions with no `steps` array understood by this worker, 2 booking.
- All 210 active are due; none future or missing due time. Current due range: 2026-02-01T18:24:30.793Z–2026-09-10T00:46:52.172Z. Creation range across all records: 2026-01-30T10:08:59.879Z–2026-09-10T00:46:52.172Z.
- 0 instance eligibility grants; 0 SMS enrollment grants; 0 linked lead communication capture stamps. 26 instances have no matching current lead, 22 of them active.
- 102 leads: 1 has explicit SMS consent under supported schema; 101 do not. No active instance links to the explicitly opted-in lead. That one lead is not classified as send-eligible: no enrollment grant, recipient/current suppression validation or authenticated workflow evidence was established.

| Active definition | Remaining work | Purpose |
|---|---|---|
| Welcome ×104 | welcome email; welcome SMS; follow-up email | lead_received; lead_received; follow_up |
| Booking ×2 | confirmation email; confirmation SMS; relative SMS reminder; delay; reminder email | booking; booking; reminder; workflow; reminder |
| Legacy without worker steps ×104 | no executable steps in current definition | cannot infer |

312 remaining welcome message steps and 8 booking message steps (320 message steps), plus 2 delays. Only the CURRENT nextExecutionAt is persisted; later dates depend on actual step progression or event time. Do not invent due timestamps for those future steps. Unknown legacy definitions have no measurable message-step count.

“Zero eligible” is a technical finding under the new worker: all current instances lack its required eligibility grants. It is NOT proof that every older workflow lacked original business/customer authorization. Original authorization for legitimate legacy work has not been established or disproved by this schema check. SMS has an additional independent blocker: every instance lacks the required SMS enrollment grant, and none of the active instances links to the one lead with explicit supported-schema SMS consent. No conclusion about historical email consent is inferred from the absence of new-format grants.

The no-step mutation defect found at f7422e7 is now fixed: processInstance checks eligibility before any completion, progression, or deleted-workflow error write. Ineligible empty workflows log communication_refused/workflow_not_authorized and remain unchanged. The later purpose-specific dispatch check is retained. Eligible empty workflows can still complete without sending. No production records were modified.

Empty history is not proof that no other notification path ever sent. It does contradict the proposal's claim that this queue demonstrates customers already received welcome email/SMS and await only their two-day follow-up. None is currently at step 2. A future reminder can be legitimate work; age or pending status alone neither proves historical replay nor supplies authorization. Under this worker, original grants and current consent remain necessary.

## Options and recommendation

1. Keep the old worker deployed temporarily, without resuming it or creating the missing index: preserves current state while readiness work proceeds, but does not resolve the existing notification gap. Running it to drain work is unsafe: no verified grants, and no atomic per-step claim shared with the new worker. Overlapping old/new invocations can duplicate processing.
2. Drain verified eligible work: currently empty set. A future drain needs exact-ID evidence, recipient and current consent/suppression checks, provider-attempt reconciliation, one exclusive worker and durable per-step idempotency. Existing worker enrollment uses add(), and send/progression are not one atomic claim. Do not promise exactly-once sending or run competing workers. No legacy grant backfill is authorized.
3. Hold affected records for review: recommended. Today preserve all bytes with workers unresumed and index absent; this is an operational hold, NOT a status rewrite. If workers must later resume, first approve and implement a reviewed hold/exclusion mechanism, including no-step records, with no inferred grant. Review legitimate requests individually; recover only through separately authorized exact-ID held work. This leaves a measured service gap rather than risking duplicate/unauthorized notifications.

No available option currently closes the gap safely. Authenticated non-public grant issuance, exclusive dispatch/idempotency, and reviewed treatment of unsupported definitions remain required before booking/campaign worker resumption. A notification-suppressed intake test does not require resuming this worker.

## Exact scope and order (proposal only)

Relative to f7422e7, this revision changes only processInstance to gate mutations, its focused regression/runtime tests, generated SMS-overlay source fixture/provenance, and this assessment. No frontend, App Check, service mapping, payload, key or capture timestamp logic changed. The inherited deployment tooling and fixed epoch remain unchanged.

1. Complete exact-head CI and review; preserve source/configuration rollback archives for current deployments, and reconfirm live fingerprints before any authorized operation.
2. Separately authorize staging the pinned eligibility value on existing submitPublicLead (Gen1 nodejs22) and onNewLead, processBulkCampaign, calcomWebhook, processWorkflowQueue, sendDirectMessage (Gen1 nodejs20), project canvas-adnvertising, us-central1. Existing code ignores it. Leave ownership, pause/sending settings, index and workers unchanged. Verify all agree; staging alone does not authorize the subsequent deployment.
3. Deploy only the prepared SMS-target package: onNewLead, processBulkCampaign, calcomWebhook, processWorkflowQueue, sendDirectMessage. Keep worker blocked. Deploy sender guards before new captures/CRM ownership. Never run old and new workers concurrently.
4. Deploy only the public/adapter package: submitPublicLead, createCrmIntegrationTestAuthorization, onCanvasLeadForCRM, processCrmLeadDeliveryQueue. Predeploy reads all existing targets again; dotenv supplies the identical value for new exports. Grant-bearing captures cannot occur in an unset window. No CRM ownership flip.
5. Canonical CRM owner separately reviews/deploys its exact scope. Reconfirm private access, exact test-ID authorization, tenant credential binding, general intake/forwarding disabled except a separately approved bounded mechanism, and zero transport/outbox/workflow enrollment for the suppressed test. Do not implicitly accept deleting policy as rollback or enabling general intake as a requirement.
6. Only after independent approval, run one fresh notification-suppressed test. Still no worker resumption, historical jobs, ownership flip or held release. Signed inbound opt-out and email readiness remain activation gates, not evidence supplied by this test.

Excluded: syncLeadToCRM v6, createLeadUploadSession v3, all other Functions, all Hosting assets (including the five deployed frontend files/App Check), rules, indexes, CRM source changes, credentials, sends and replay. The SMS package now includes the processInstance ordering fix; its only changed existing runtime file remains index.js. The public/adapter runtime archive remains identical to the reviewed 75bf overlay. Regenerated wrappers retain the deployment gate and the same proposed environment value. Existing legacy-trigger and SMS safeguards are preserved.

Stop on failed precondition/CI, stale live baseline, conflicting grants, candidate env overrides, an unsupported workflow slated for resumption, unverified provider attempt, concurrent worker, missing non-public proof issuer, any test enrollment/provider call, tenant/auth mismatch, or changed original bytes/key/capture. No production test was run.

Rollback: preserve the pinned timestamp forever once used; neither remove it nor rotate it. Keep purpose-aware immutable ownership and historical-exclusion guards once CRM-owned captures exist. Stop intake/dispatch through separately approved controls, retain unresolved/held records, and restore only compatible reviewed runtime/configuration. Restoring website ownership never reassigns an originally CRM-owned receipt. Do not delete policy/obligation records, flush queues, release held work, or restore an old unguarded sender. A timestamp-only staging rollback before any grant exists is unnecessary; leaving it inert is safer than rotating it.

## Executed checks

The f7422e7 results (83 units, 11 split-overlay emulator tests, green CI) are prior-head evidence. For this revision, rerun the Functions unit suite including the new no-step regression and the 11 split-overlay emulator tests, now also checking an ineligible persisted empty workflow remains unchanged. Existing proof issuance, transaction/concurrency, retry and immediate onNewLead suppression tests are reused; transports remain mocked. Exact executed results and exact-head CI are reported in the CAM-223 handoff. Inventory and live configuration evidence above are reused from the prior read-only assessment, not newly queried.
