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

- Reconcile this branch with the currently deployed secure `createLeadUploadSession` / `submitPublicLead` source before deploying Functions. That newer callable implementation is present in the Canvas working copy and production runtime but is not yet committed on this PR's remote base; deploying this branch as-is could regress the secured form path.
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
