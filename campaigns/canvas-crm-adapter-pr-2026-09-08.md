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

- Confirm that the CRM route is deployed and reachable.
- Confirm the Canvas tenant document's live `slug`; `canvas_advertising` is documented but explicitly unverified.
- Provision a tenant-scoped credential in server secret storage. Never share it in chat or browser configuration.
- Confirm the deployed Canvas tenant service allowlist matches every proposed translation.
- Run staging fixtures for `created`, `duplicate_ignored`, `validation_failed`, `unsupported_service`, `idempotency_conflict`, timeout, and interrupted-worker recovery.
- Reauthenticate the Firebase CLI only when staging/deployment or Cloud Logging verification begins; current local implementation/tests do not require it.
- Review the existing unrelated dirty changes in `functions/index.js` before merging so they are not accidentally included in this PR.

## Explicit non-goals

- No CRM forwarding enabled.
- No existing/held lead replay.
- No production deployment.
- No customer URL placed into the CRM honeypot.
