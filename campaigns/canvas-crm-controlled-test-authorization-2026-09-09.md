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
- Pipeline: existing pipeline.
- Entry stage: `new_lead`.
- Services: the reviewed Canvas service list.
- Notifications: Canvas only; CRM email off for the pilot.
- CAM-274 verified-domain and usage-billing work remains a separate CRM task.
- Owner and Canvas notification recipient remain pending user confirmation.
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

Deploy only `createCrmIntegrationTestAuthorization`, `submitPublicLead`,
`syncLeadToCRM`, `processCrmLeadDeliveryQueue`, and `onNewLead`, plus the reviewed
Firestore Rules that deny browser access to the authorization collection.
Storage Rules and Hosting are excluded. Credentials remain server-side.
