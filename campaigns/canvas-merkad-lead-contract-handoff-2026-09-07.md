# Canvas → Merkad CRM contract handoff (corrected after CAM-223)

Repository preparation only. CRM intake and general forwarding remain disabled; no credential provisioning, deployment, production test or replay is authorized here.

## Tenant and server boundary

Tenant resolution is path-scoped and credential-verified. The server endpoint is `POST /api/v1/tenants/{tenantSlug}/leads/intake`; a credential is looked up within the tenant named in that path, so a key for a different tenant is rejected. Canvas's reviewed server configuration is base URL `https://crm.merkadagency.com` and slug `canvas_advertising`. The endpoint, credential and authorization logic are server-held, never browser configuration. The slug is not added to the lead body or a custom tenant header. This replaces the incorrect claim that no slug is sent in the URL.

## Service translation

The adapter rewrites stored website `service` values into approved CRM `requestedService` labels using `SERVICE_MAPPING`; values are not forwarded verbatim. Unmapped services produce an empty mapping and are blocked locally before any CRM HTTP call. Existing legacy aliases cover ten labels, as confirmed by the CRM owner's CAM-223 review. The new product-first canonical aliases and version-1 productionRequest SMS consent mapping from PR #4 are retained on the separate codex/canvas-crm-product-mapping branch; they are required before testing the currently deployed quote page. Never silently use an unrelated fallback service.

## Saved record versus CRM delivery

The browser's success means submitPublicLead accepted/saved the Canvas record. It does not mean CRM acceptance, email or SMS delivery. Upload authorization and lead persistence remain on Canvas; CRM delivery is secondary. The proposed adapter captures an immutable serializedBody and `canvas-lead:{submissionId}` idempotency key. Unsupported fields are recorded as diagnostics; structured specifications and upload metadata remain on the source Canvas document. No existing source or outbox records are rewritten.

## Disabled state and controlled authorization

General delivery requires `CRM_LEAD_ADAPTER_ENABLED=true` and complete server configuration. Keep it false. A separately approved exact-ID test can use the disabled-mode exception only with complete config, approved service mapping, the exact server-configured ID, and persisted server authorization. A public source marker or knowledge of the ID is insufficient. A verified staff callable issues a short-lived proof; submitPublicLead consumes it atomically with lead creation. Only the token hash is persisted, and the proof is not copied into the lead/outbox. Browser-visible test proof is not the CRM credential.

The worker trusts durable authorization copied to the outbox after consumption and handles only the exact configured ID in test mode. It can recover a missing outbox only from that exact trusted source lead. Held/historical records are not scanned or replayed. Canvas notifications are suppressed only for the trusted server marker + exact ID + test source; CRM must also have its notification suppression independently confirmed. Canvas's general role as notification owner does not itself guarantee no sends during a test.

## Test evidence boundary

The emulator runtime suite invokes the actual exported submitPublicLead, syncLeadToCRM, processCrmLeadDeliveryQueue and onNewLead callbacks against real Firestore emulator transactions. It covers concurrent consumption, transaction abort, commit-success/response-loss retry, consumed-proof lease recovery and missing-outbox recovery. Failure injection surrounds real transaction boundaries; CRM HTTP is mocked. No real credential, CRM endpoint, live lead, notification or deployment is exercised. See docs/crm-integration-review.md for exact evidence and release prerequisites.
