# Canvas CRM controlled-test authorization

Status: prepared and tested; not deployed. General forwarding is disabled and
historical deliveries remain excluded.

## Security boundary

An exact submission ID or visitor-supplied `source: crm_integration_test` is not
authorization. A verified allowlisted Canvas staff member must call
`createCrmIntegrationTestAuthorization` while the exact disabled-mode test ID is
configured. The callable creates a 32-byte random proof, stores only its SHA-256
hash in a private Firestore document, and returns the proof once.

The normal public lead callable still validates the entire form and applies the
normal rate limit. In the lead-creation transaction it validates expiry, unused
state, and the proof using a timing-safe comparison, consumes the authorization,
and only then writes the server-owned `crmIntegrationTestAuthorized` marker and
trusted test source. The proof is never stored on the lead or outbox.

Without that server authorization, a visitor test source is downgraded to
`form_submit`; the record follows normal notifications and is held from disabled
CRM delivery even if its ID happens to equal the configured test ID.

## Pilot configuration retained

- CRM forwarding: `false` globally.
- Tenant: `canvas_advertising`.
- Owner: `sales@canvas-advertising.com` / UID
  `vsLEY55ofGe8cg4S0wmMB3VvbeR2`, verified active tenant admin.
- Pipeline: existing pipeline.
- Entry stage: `new_lead`.
- Services: the reviewed Canvas service list.
- Notifications: Canvas only; CRM email off for the pilot.
- CAM-274 verified-domain and usage-billing work remains a separate CRM task.
- Existing Canvas workflows retain their recipients: each lead's submitted email
  and phone. No fixed internal notification recipient exists in deployed
  `canvas_workflows` or `canvas_settings`; an internal sales-alert recipient
  remains pending user confirmation.
- Historical held deliveries are not replayed.

## Controlled checks

1. Use one approved synthetic form submission and one one-time authorization.
2. Confirm form validation and Firebase acceptance before any success UI.
3. Confirm one saved `canvas_leads` document and one outbox document.
4. Confirm notification suppression and CRM test delivery require the trusted
   server marker, exact ID, and valid disabled-mode configuration.
5. Idempotency check: retry the same exact serialized bytes and
   `canvas-lead:{submissionId}`; require the same CRM IDs.
6. Contact-reuse check is distinct: it requires a separately approved second
   synthetic submission with a new submission/idempotency key but the same
   synthetic contact. Do not run it unless added to the approved scope.

## Deployment scope for a later approval

Required release components are:

1. Firestore Rules denying every browser read/write to
   `crmIntegrationTestAuthorizations/{submissionId}`.
2. `createCrmIntegrationTestAuthorization`, which issues the proof only to
   verified allowlisted Canvas staff and only for the exact disabled-mode ID.
3. `submitPublicLead`, which keeps normal validation/rate limiting and consumes
   the proof atomically with creation of the authorized lead.
4. `onNewLead`, which suppresses Canvas workflows only for the persisted trusted
   authorization, exact ID, and server-owned source.
5. `syncLeadToCRM`, which persists `testAuthorized` on the outbox record.
6. `processCrmLeadDeliveryQueue`, which selects only the exact configured test
   record while general forwarding is disabled and reuses persisted outbox
   authorization after the proof has been consumed.
7. Server configuration with `CRM_LEAD_ADAPTER_ENABLED=false`, the exact test
   ID, approved endpoint/tenant/service mapping, and existing Secret Manager
   bindings. Credential values never enter source, browser code, or the handoff.

After explicit approval, deploy the Firestore Rules and exactly those five
Functions. Storage Rules and Hosting are excluded. Verify the deployed function
set and ruleset before issuing the one-time proof.

## Failure and retry invariants

Proof consumption and authorized lead creation occur in the same Firestore
transaction. If validation, upload verification, or the transaction fails, the
proof is not consumed and the same authorized request can retry. If the commit
succeeds but the response is lost, the retry finds the existing lead and returns
the normal duplicate acceptance; the trusted authorization is already durable.

The CRM trigger copies the trusted lead marker to `testAuthorized` on the outbox
record. Delivery attempts and expired-lease recovery read that persisted outbox
field, so they do not need or revalidate the consumed proof. Exact serialized
bytes and `canvas-lead:{submissionId}` remain unchanged across retries.

## Separate CRM prerequisite

The CRM owner reports that external notification-owner implementation work is
not yet confirmed committed and deployed. Canvas remains the sole notifier and
CRM email stays off; CAM-274 verified-domain and usage-billing work remains a
separate CRM implementation task.
