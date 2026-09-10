# Canvas CRM integration review — no release authorization

Current main base: 85e1984e2d898c12e41ec1b83df5acb1e64ea3ed (PR #8 merged).
Reviewed inputs: PR #1 949822ca46d18819a36c9dc5605b205d86853a98; PR #2 e94f3853db649f3e4a183f7761abdef14e52e80d; PR #3 41b323b91e6af8e26cac08cf2bcc482bf991fa2c.

This isolated integration branch combines the three source deltas for review only. Original PRs/bases are unchanged. #1 conflicts with deployed App Check in main: resolved using main's exact client. #2 package/lock conflicts: preserve frontend jsdom/scripts and add rules-test dependencies; regenerate lock without lifecycle scripts. #3 integrates without textual conflict. All five reconciled frontend files remain identical to main/live. No GitHub PR has been merged, and main is unchanged.

## Test commands and boundaries

- `npm ci && npm --prefix functions ci`
- `npm run test:frontend && npm run check:frontend`
- `npm --prefix functions test` (pure unit/model/source tests)
- `npm run test:storage-rules` (real Firestore/Storage emulator authorization tests)
- `npm run test:crm-runtime` (the five real-transaction runtime cases)

Java 21 is installed by test-only CI. Local Java is unavailable; emulator execution is required in CI rather than claimed from the MemoryDb model. The runtime suite invokes actual exported callbacks, not copied/reimplemented handler code. It injects pre-commit/outbox failures and post-commit response loss around real emulator transactions; CRM HTTP is mocked with reserved .invalid host and inert fixture strings. Only the demo-canvas-integration project and loopback emulator are accepted. No credentials are provisioned/installed/read and no production data is submitted. Runtime tests do not establish deployed platform trigger delivery, CRM API acceptance, or actual notification delivery.

## Backend mapping retained separately

PR #4's functions/crm-lead-adapter.js changes are preserved on the dependent codex/canvas-crm-product-mapping branch: nine canonical aliases, leaving all legacy aliases intact, plus productionRequest.version===1 consent mapping with legacy boatSurvey fallback. This separate delta is a prerequisite for a test using the current product-first quote page. Do not test that page against the legacy-only map. Tests on that branch verify every canonical ID/label, preserved legacy aliases, and explicit true/false/missing consent.

PR #4's quote HTML/CSS/JS and frontend tests and all PR #7 frontend changes are superseded by merged #8 (85e1984...). The backend adapter mapping in #4 is not superseded. Keep it linked to the separate mapping branch before closing #4 as frontend-superseded. No original PR was closed or retargeted here.

## Exact remaining controlled E2E gates — all unexecuted

1. Review final exact SHAs/CI and the mapping dependency. This branch is not the live Functions baseline: separately deployed #5 SMS safeguards and #6 legacy disabled guard must be preserved in any future live-source overlay. Do not deploy this checkout wholesale. Review replacing the legacy syncLeadToCRM export with the new adapter; never register both. Keep normal-customer SMS consent checks when overlaying onNewLead. Reconcile Firestore/Storage rules against live versions separately, with #2's rules evidence retained.
2. CRM owner verifies deployed endpoint/contract, canvas_advertising tenant, approved service allowlist, existing pipeline/new_lead stage, explicit owner, and test notification policy. CAM-223's contract mapping acceptance is evidence, not proof every deployed prerequisite or owner choice is current. Keep tenant intake off until a separately authorized test window. General-forwarding gates remain false.
3. Obtain approval for exact component deployment and immutable source/config rollback. Proposed new-adapter scope: createCrmIntegrationTestAuthorization, submitPublicLead, onNewLead, syncLeadToCRM and processCrmLeadDeliveryQueue, private authorization Firestore rules, and separately reviewed Storage rules if required. Hosting is already deployed and excluded. No missing notification index, queue recovery or held-lead replay is needed or authorized.
4. Separately authorize credential provisioning/handoff. Owner uses recent tenant-admin authentication, transfers the credential directly to server Secret Manager and records only its key ID; no secret in chat, ticket, repo, browser or logs. Verify bindings. Do not generate/install anything as part of this review.
5. Approve exactly one fresh synthetic website submission ID, reserved non-deliverable contact identity, product/service, no-file versus small-file scope, and expected records. Contact reuse needs a second separately approved ID; the older direct API harness can create two records and is not this one-submission test. Real recipients and notifications are not implied. Agree whether the run includes any owner UI dry-run/test-lead actions, which are separate from the website API flow.
6. After approved releases, check current runtime/rules hashes and config read-only. Keep CRM_LEAD_ADAPTER_ENABLED=false. Configure only the exact test ID and approved mapping/server settings; confirm both website trusted-test suppression and CRM notification suppression. Authorize a bounded CRM tenant-intake test window separately. Intake disabled cannot return successful CRM acceptance; do not claim an E2E pass without that explicit window.
7. Verified staff issues a short-lived one-time proof for that exact ID. Use a reviewed test harness through the real public callable path with validation/upload checks intact, presenting the proof transiently; current ordinary quote UI does not issue proofs. Confirm only Canvas-saved success, one source record, consumed proof and trusted server marker. Do not manually label a visitor record trusted.
8. Confirm exact outbox serializedBody, canonical mapping, testAuthorized and canvas-lead:{id}; require CRM created acceptance and saved lead/contact/opportunity IDs under approved owner/stage. Verify requested file association locally if included; typed CRM upload ingestion remains a separate dependency.
9. Only if explicitly in run approval, repeat identical bytes with the same key, then alter one field with that same key: require duplicate_ignored with original IDs, then idempotency_conflict with no new records. This is confined to the newly approved record, never historical replay. Verify Canvas and CRM notification logs show no sends; 'Canvas owns notifications' alone is not suppression.
10. Close the approved intake window, clear exact-ID test configuration, expire/revoke temporary proof authorization as appropriate, retain source/outbox/audit evidence, and reconcile exactly the approved counts. Keep general forwarding off. Do not drain queues or revise old outbox bodies. General activation needs separate approval and remaining CRM-side readiness work from CAM-223.

## Documentation corrections

campaigns/canvas-merkad-lead-contract-handoff-2026-09-07.md now describes tenant-in-path plus credential verification and SERVICE_MAPPING translation. Removed stale no-slug/value-unchanged claims. The older E2E procedure is explicitly separate and points here; corrected its public-marker authorization and success-message claims. No CRM-side code change is implied by these prose corrections.
