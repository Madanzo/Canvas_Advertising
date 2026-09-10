# Adapter compatibility review — preparation only

Canonical CRM contract: `ebed548e67fe493117f1cf5cc10fac371f7d84c1`.
Website base: `3c0324a8fa455cff792a1cc8c6c0cbfe649fa835` (split-overlay tests), on communications `2559dad2ba22257e1e9ea487775fd9d0987a913a`, mapping `eeb06de8c8e9e1c9063e56acfaba74ca5ff51cbe`, integration `61f9a71ab917f6ace51d736c248a5d8f609fc9c5`.

## Contract and trust boundary

The adapter emits `policyVersion: 1`, `notificationOwner`, `testSuppressed`, and, when trustworthy, the original `capturedAt` and matching `transitionId`. `communicationPolicyVersion` remains the internal saved capture schema; it is not the CRM wire field.

The public submission handler rejects unknown input fields and overwrites capture metadata from trusted environment policy inside the original persistence transaction. The adapter reads only that stored `communications` snapshot and trusted server configuration. Top-level visitor ownership/version/transition/time/suppression fields are ignored. No new capture stamping, form changes, consent grants or fallback from createdAt/submittedAt/forwarding time is introduced.

CRM eligibility requires every existing website readiness gate, a matching original CRM epoch, valid original capture time at/after configured cutover, known schema and an explicit boolean suppression value. Controlled-test suppression always wins. CRM separately checks its own policy, capture upper bound using its server clock, consent and suppression. No provider send is exercised here.

Absent or unready configuration, missing/malformed capture, historical website epoch and pre-cutover records remain valid lead payloads with `testSuppressed: true` and no enrollment-authorizing transition. Valid original capture timestamps remain unchanged; missing timestamps remain absent. Neither createdAt nor submittedAt is substituted for capturedAt.

## Retry behavior

Outbox creation remains create-if-absent. Duplicate events cannot replace the original serialized body, idempotency key (`canvas-lead:<original ID>`) or capture timestamp. HTTP retries reuse those exact bytes and key. Changing policy never promotes a previously suppressed outbox into enrollment.

New suppressed payloads may deliver under the existing adapter intake authorization gates despite communications-policy mismatch. Previously frozen unsuppressed payloads are still held on policy drift: rewriting them would violate idempotency and might duplicate enrollment. Missing/invalid serialized bodies are not authorized by this change. Resolving any such historical held delivery remains a separate explicit decision; this branch includes no recovery runner and initiates no replay.

## Executable fixture

`functions/test/fixtures/crm-contract-ebed548.cjs` bundles the actual canonical `validateIntake`, `decideEnrollment`, and consent helpers, not a reimplemented contract. Source snapshots and SHA-256 values are in `functions/test/fixtures/crm-contract-source/`. Built with esbuild from an isolated git archive of the exact canonical SHA and existing local dependencies. The canonical worktree was never modified. Bundle exports are executed against the actual adapter's serialized output; the readable canonical enrollment/validation sources accompany the bundle. This is contract-unit evidence, not CRM deployed route/auth or transaction evidence.

`npm --prefix functions test` includes actual mapping, visitor overrides, missing readiness, historical/malformed captures, tests, future-time CRM rejection, original outbox preservation through duplicate callbacks and exact HTTP retry bytes/headers. The split emulator fixture uses the changed adapter helper bytes from this branch plus three unchanged source slices and separate deployed dependency locks. Its manifest explicitly distinguishes the candidate adapter from the previous archive; previous ZIP fingerprints must not be presented as this candidate.

## Scope and remaining gates

Runtime changes only `functions/crm-lead-adapter.js` and the adapter section of `functions/index.js`. Website HTML/CSS/main.js, firebase-config.js/App Check references, existing SMS-consent helpers, legacy disabled-forwarding guard, public capture handler and website notification helpers are unchanged. Tests, source fixtures and the test-only branch CI trigger are included.

Dependency order: integration → mapping → communications → split tests → this adapter compatibility branch. CRM consolidation remains canonical-agent-owned. No merge or deployment is authorized.

Before any controlled deployment: canonical agent confirms this exact wire contract and tenant transition agreement; freshly prepare/review a minimal live-source adapter overlay and rollback from current live source; preserve SMS safeguards and legacy trigger; review exact-ID test authorization, authentication and notification suppression on both systems. Keep all existing intake/forwarding/communications enablement off until separately approved. Historical queues require explicit exclusion, not re-enrollment. Existing unsuppressed frozen deliveries cannot be rewritten automatically. Actual Cloud IAM, CRM intake acceptance/atomic outbox behavior, provider readiness and delivery remain separate validation gates. No credentials, ownership changes, notifications, submissions or replay performed.
