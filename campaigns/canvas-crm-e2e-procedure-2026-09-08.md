# Canvas → Merkad API contract integration test procedure

Status: **prepared but not executed**. CRM forwarding remains disabled.

## Scope and safety

This is an API contract integration harness, not a full website-to-CRM test. It targets the deployed contract at:

`POST {CRM_E2E_BASE_URL}/api/v1/tenants/canvas_advertising/leads/intake`

It sends only synthetic records. The email uses the reserved, undeliverable `example.invalid` domain. The exact synthetic phone is `+1 512-555-0199`, which is inside the reserved fictional `555-01xx` range. Both consent flags are false, and the message says not to contact. The CRM `website` honeypot stays empty.

The harness is intentionally excluded from `npm test` and GitHub Actions. It requires an explicit write acknowledgement and credentials supplied to the local process from an approved secret source. Do not paste secrets into chat, commit them, save them in `.env` files, or expose them to the browser.

## Expected CRM and notification side effects

- The successful fixture may create one test lead, contact, and opportunity in the `canvas_advertising` tenant.
- The timeout fixture may create a second test lead, contact, and opportunity because the server can finish after the client aborts.
- Identical retries must not create additional records; they return `duplicate_ignored` with the original IDs.
- The conflicting retry and unsupported-service fixture must not create a lead/contact/opportunity.
- CRM internal owner/admin notifications may fire for each newly created synthetic lead if tenant notifications are enabled. Confirm the recipients and either approve those internal notifications or disable them in a staging tenant before running.
- Customer email/SMS must not be sent: the address is undeliverable, the phone is fictional, consent is false, and the record is clearly marked synthetic. Still verify that no tenant automation ignores these safeguards before the run.

## Preconditions

1. CRM lead-intake rules and indexes from commit `b136819` are deployed, and the CRM agent reports readiness. Retain that deployment evidence with the test record.
2. Verify tenant slug `canvas_advertising` resolves to the intended non-production or controlled test tenant.
3. Confirm Website Leads is enabled for that tenant and that its default owner, pipeline/stage, service allowlist, and notification settings are known.
4. Confirm `Vehicle Wraps` is allowed and the deliberately unsupported fixture is not allowed.
5. Create a dedicated, least-privilege tenant credential through the approved CRM administration flow and store it in an approved secret store. Credential creation is outside this PR.
6. Record the pre-test lead/contact/opportunity counts and notification-log position for later reconciliation.

## Run

From `functions/`, obtain the credential values directly from the approved secret source into process environment variables, then run:

```text
CRM_E2E_KEY_ID=<secret-source-reference> \
CRM_E2E_SECRET=<secret-source-reference> \
CRM_E2E_CONFIRM_WRITE=YES_SYNTHETIC_WRITES \
npm run test:crm-e2e
```

`CRM_E2E_BASE_URL` may be set only if the approved deployed base URL differs from `https://merkad-agency-canvas.web.app`. The tenant slug is fixed in the harness to `canvas_advertising`.

## Assertions performed

1. Synthetic valid request returns `201 created` with CRM IDs.
2. Byte-identical retry with the same idempotency key returns `200 duplicate_ignored` and the same lead/contact/opportunity IDs.
3. Modified bytes with the same key return `409 idempotency_conflict`.
4. A deliberately unsupported `requestedService` returns `422 unsupported_service`.
5. A request aborted locally after 1 ms is retried with the exact bytes and key; recovery may return `201 created` or `200 duplicate_ignored`. A final identical retry must return `duplicate_ignored` with the same IDs.

## Post-run reconciliation

1. Locate records by `externalDocId` prefix `canvas-e2e-` and mark them as test data according to CRM policy.
2. Confirm no more than two lead/contact/opportunity sets were created.
3. Confirm conflict and unsupported-service cases created no records.
4. Review internal notification logs and confirm no customer-directed email or SMS was attempted.
5. Preserve response codes, correlation IDs, CRM IDs, and timestamps in the integration evidence. Never copy credentials into the evidence.

## Full website-to-CRM test still required

After this API contract harness passes, a separate controlled test must exercise the complete production-shaped path:

1. Submit the public Canvas form with synthetic data.
2. Verify the original submission is accepted and saved in `canvas_leads/{submissionId}`.
3. Verify `crm_lead_deliveries/{submissionId}` contains the exact serialized body, `canvas-lead:{submissionId}` idempotency key, supported mapping, and unsupported-field diagnostics.
4. Verify the delivery worker claims the outbox record and calls the CRM only after forwarding is deliberately enabled in a separately approved test environment.
5. Verify the CRM IDs/status are written back to the outbox and the form confirmation reflects an actually accepted active delivery path.
6. Verify notification and retry behavior, then return forwarding to disabled unless production enablement is separately approved.

## Secret Manager bindings for Canvas Functions

PR #1 reads `MERKAD_LEADS_KEY_ID` and `MERKAD_LEADS_SECRET` from `process.env` and now declares both Firebase Secret Manager bindings on `syncLeadToCRM` and `processCrmLeadDeliveryQueue` using the project's first-generation `functions.runWith({ secrets: [...] })` convention. No secret values are created or read by this change. Before any Functions deployment that could enable delivery:

- Store `MERKAD_LEADS_KEY_ID` and `MERKAD_LEADS_SECRET` as separate server-side secrets, or store the complete bearer credential as one secret after a reviewed code change.
- Verify both secret resources exist and that the bindings on **both** functions resolve during a controlled deployment; both functions can perform delivery.
- Grant secret access only to the runtime service account for these functions and authorized deployers.
- Keep `MERKAD_LEADS_BASE_URL`, `MERKAD_LEADS_TENANT_SLUG=canvas_advertising`, `CRM_LEAD_ADAPTER_ENABLED=false`, and `MERKAD_LEADS_SERVICE_ALLOWLIST_CONFIRMED=false` as non-secret server configuration while verification is incomplete.
- Do not deploy the current Functions changes until the secret resources, tenant configuration, and authenticated integration plan are reviewed. A missing secret must be treated as a blocker, not worked around with client-side configuration.

## Merge/deployment workflow review

The repository contains one workflow: `.github/workflows/functions-ci.yml`. It runs only tests and syntax checks on pull requests. It has no `push` trigger, Firebase action, credential reference, or deployment command. Therefore, merging PR #1 does **not** trigger an existing GitHub Actions deployment workflow. Manual or external deployment paths remain outside the repository workflow and must still be controlled separately.
