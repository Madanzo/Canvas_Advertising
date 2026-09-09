# PR preparation: Canvas → Merkad server-side lead adapter

Branch: `codex/canvas-crm-lead-adapter`

## Summary

- Adds a disabled, server-only Merkad delivery adapter.
- Reconciles the request with the actual flat contract on CRM integration commit `26140ea`.
- Stores and reuses the exact serialized request bytes with `canvas-lead:{submissionId}`.
- Adds explicit unsupported-field diagnostics for project data, uploads, business URLs, and privacy consent.
- Adds retry classification, timeout handling, duplicate/conflict handling, and interrupted-worker lease recovery.
- Keeps held leads out of automatic replay.
- Does not modify the browser's existing Firebase submission/confirmation flow.

## Verification

Run from `functions/`:

```text
npm test
node --check index.js
```

The mock transport suite covers created acceptance, duplicate acceptance, validation failure, idempotency conflict, timeout, exact-byte reuse, feature gating, and expired processing-lease recovery.

## Deployment blockers

- Reconciled the branch with authenticated exports of the deployed secure callable source. `createLeadUploadSession` is active on Node 22 with Firebase hash `92c938b593904fbb39bed093a6d7a70734eee70c`; `submitPublicLead` and `cleanupExpiredLeadUploads` are active on Node 22 with hash `fa735d6e2e4afa96533868045622225183610546`. The later upload package differs from the submission package only by upload-path authorization hardening, so the combined source retains the later protection.
- Active Firestore rules were retrieved as immutable ruleset `de2e3d6f-3dbe-486d-8c4b-64b43008020b` (SHA-256 `d9d985f35d713cb3a37d36d2f19f79ebdca2e61f242fe8ac3b044fafe2c36979`) and active Storage rules as ruleset `0579db75-7cbc-4f46-90b0-12ad573d151f` (SHA-256 `8bb3fc4ec6320cf8a977b7762e35d6bc74a399a0165c352fbe080e49286ae094`). Both match the preserved working-copy sources.
- CRM lead-intake rules and indexes from commit `b136819` are deployed, with readiness reported by the CRM agent. This blocker is resolved; retain deployment evidence for integration testing.
- The public endpoint and tenant path are confirmed as `POST https://crm.merkadagency.com/api/v1/tenants/canvas_advertising/leads/intake`.
- Configure tenant `canvas_advertising` for Website Leads. It is currently disabled, has no Canvas service allowlist or default owner, and has no approved notification owner. Confirm the intended pipeline/stage as part of this configuration.
- Confirm the contact match-key backfill/readiness gate; the read-only CRM check found no completion stamp.
- Provision a tenant-scoped credential in server secret storage. Never share it in chat or browser configuration.
- Verify the declared `MERKAD_LEADS_KEY_ID` and `MERKAD_LEADS_SECRET` bindings resolve for both delivery functions in a controlled deployment.
- Confirm the deployed Canvas tenant service allowlist matches every proposed translation.
- Run the API contract integration fixtures, then separately run a full website-to-CRM test through the form, saved submission, outbox, and delivery worker.
- Reauthenticate the Firebase CLI only when staging/deployment or Cloud Logging verification begins; current local implementation/tests do not require it.
- Review the existing unrelated dirty changes in `functions/index.js` before merging so they are not accidentally included in this PR.

## Explicit non-goals

- No CRM forwarding enabled.
- No existing/held lead replay.
- No production deployment.
- No customer URL placed into the CRM honeypot.
