# Canvas website commerce integration

Integration against CRM PR #32, backend head `84f66cb` (adopted coordinated staff-review schema fix).
New commerce forwarding and live commerce payments remain disabled; no deployment
or historical replay is authorized. Existing production CRM lead intake/forwarding
is left unchanged by this commerce branch. This statement does not assert its live
configuration or disable an already active lead-delivery path.

## Review preview and contract

Run `CRM_TEST_ROOT=/private/tmp/canvas-commerce npm run preview:commerce`, then open
`http://127.0.0.1:3210/store` or `/store-es`. The CRM checkout must contain the
reviewed PR #32 code and installed dependencies. The preview uses its actual HTTP
handler, pricing, order, payment, artwork, proof and fulfillment services; it replaces
authentication, provider and private bucket boundaries with isolated test doubles.
It does not contact production Firebase, Finix, Square, CRM, or email services.
The preview banner, simulated token, recovery mailbox and staff proof controls are
localhost-only harness features, not production endpoints. Closing the server resets
its in-memory synthetic orders. Images and test prices are not published catalog data.

Reviewed sources in CRM: `docs/CANVAS_COMMERCE_API.md`,
`docs/commerce/ACCEPTANCE.md`, OpenAPI and fixtures under `docs/commerce/`.
The endpoint path is `/api/v1/tenants/canvas_advertising/commerce/{operation}`;
no deployed hostname is selected by this change. CAM-290 is the website surface,
CAM-291 owns authoritative catalog/pricing, CAM-292 durable ingestion/notifications,
and CAM-233 artwork/proof/production lifecycle. Their operational acceptance is not
complete merely because the isolated preview passes.

## Implemented mapping and safety

- Published SKU/options, area dimensions, piece/pack quantity, garment variant
  matrices and design-assistance brief form the backend quote request. The browser
  displays backend subtotal, fees, shipping, tax, total, expiry and quote hash; it
  never authorizes a charge amount. Cart lines can be edited, duplicated and removed.
- Checkout binds the current quote and explicit versioned terms acceptance to
  contact and fulfillment data. Backend order/contact/opportunity/invoice IDs are
  authoritative; no new sales lead is created by the website commerce adapter.
- Each source file manifest specifies purchased `itemId`, `placementId`, design
  assignment and allocated quantity. Files are hashed before resumable transfer.
  Backend source/final versions remain immutable; a refreshed upload URL is not a
  new purchased item. Completion can recover after a lost HTTP response.
- Every final asset is displayed in its item/placement/design group. The primary
  proof preview is not the entire approval scope: the whole immutable artwork set
  is bound by the backend proof hash. Approval requires visible decoded previews
  and explicit acceptance. Rejection followed by staff revision requires new approval.
- Order status separates captured/balance/required payment, missing artwork,
  approval and production/partial fulfillment. A fresh reorder quote requires new
  terms acceptance and does not copy mutable artwork or old approval.
- Finix hosted v2 card fields tokenize directly to the approved sandbox application.
  The website never receives/stores PAN or CVV. Browser configuration contains only
  public application ID, sandbox environment and approved terms link. A private CRM
  capability or merchant credential is never returned to the browser.

`canvas_commerce_private` is server-only under existing default-deny Firestore rules.
It contains hashed guest sessions, exact serialized mutation intents and stable
attempt identities, original checkout-email order links, hashed recovery tokens,
rate buckets, cutover leases and configuration. Exact request bytes are persisted
before CRM delivery and reused after process interruption. Checkout/reorder accepted
responses are cached; payment retries still reconcile unknown/pending/authorized
states against the backend. Upload retries refresh expiring transport authorization.
No customer-supplied source/test/actor/amount field grants privileges.

Recovery emails go only to the stored checkout email. Consuming a recovery proof
and persisting its order-scoped HttpOnly session is one transaction; transaction
failure consumes neither, and a lost response can retry the same proof. This proves
ownership of one order, not all orders belonging to a guest or email. Existing lead
submissions, uploads, notifications and general lead forwarding are unchanged.
Numeric expiry fields are application-checked, but private-record retention/cleanup
must be configured before release; they are not an automatically enabled TTL policy.

## Verification

Run from this website checkout (no production credentials):

```sh
npm ci
npm --prefix functions ci
npm --prefix functions test
npm run test:frontend
npm run check:frontend
node .github/scripts/discover-endpoints.cjs
CRM_TEST_ROOT=/private/tmp/canvas-commerce npm run test:commerce
```

Acceptance requires `CRM_TEST_ROOT`; without it the cross-repository tests are
explicitly skipped, not evidence of integration readiness. Browser tests use installed
Chrome through the CRM test dependencies. They exercise the actual pages and HTTP
adapter, not source-text assertions: two items, cart edits, exact retry after lost
checkout/capture responses, resumed/delayed uploads, split designs, all final previews,
proof rejection/revision/reapproval, scoped recovery and EN/ES responsive widths
320/375/414/768/1024/1440. They assert no non-localhost browser requests. API tests
also cover six synthetic product families, authoritative pricing/stock, partial
fulfillment, repeated release and fresh reorder. Synthetic phone is `5125550106`
(reserved `555-01xx` range).

Durable persistence and private access checks use the demo Firestore emulator:

```sh
GCLOUD_PROJECT=demo-canvas-commerce-isolated CRM_TEST_ROOT=/private/tmp/canvas-commerce \
  npx firebase-tools@latest emulators:exec --only firestore \
  --project demo-canvas-commerce-isolated --config .firebase-commerce-emulator.json \
  'node --test scripts/commerce/persistence.test.cjs'
```

Requires supported Java. Tests refuse a non-demo project/non-local emulator and cover
new-process exact-body recovery, transactional failure, concurrent/lost-response
proof consumption, and anonymous/authenticated non-staff denial. Ordinary CI runs
offline unit/frontend/syntax/trigger checks only; it does not run a real Finix sandbox
or deployment. Provider tokenization, real private-bucket signing/CORS, delivery email
and deployed CRM acceptance remain separate coordinated sandbox gates.

## Exact proposed deployment scope — approval required

Website project ID: **`canvas-adnvertising`**. Release from a clean reviewed root
checkout, never the dirty original checkout or this preview process. Proposed scope:
Hosting and `functions:canvasCommerce`, `functions:createSquareCheckoutSession`,
`functions:processSquarePayment`. No website Firestore/Storage/Auth rules or CRM lead
functions are in this deployment. Hosting excludes docs, harnesses, dependencies,
rules and secret/development files. No workflow introduced here deploys anything.

`canvasCommerce` binds existing `FUNCTIONS_CONFIG_EXPORT` and dedicated
`MERKAD_COMMERCE_API_KEY` server secrets. Configure verified non-secret
`CANVAS_COMMERCE_API_BASE_URL` and dedicated backend `commerce:session` permission
through approved server provisioning, never chat. Existing runtime mail configuration
is used for recovery from `orders@canvas-advertising.com`; verify sender authorization
and delivery in the isolated deployed environment. App Check verification on this new
HTTP route is prepared; existing callable enforcement is not changed by this branch.

Absent configuration preserves existing Square and rejects new commerce. Deploy
the guards first while commerce is disabled. The approved maintenance cutover must
audit/revoke/drain previously issued Square payment links and pre-upgrade in-flight
calls, then verify unresolved records and `activeSquareCalls` are clear before setting
`enabled: true`, `checkoutMode: finix_sandbox`, `legacySquareDisabled: true`,
`legacyLinksDrained: true`. The adapter rejects `finix_live` entirely.
Square and Finix leases share an atomic configuration barrier. Unknown payments never
expire into permission to charge with the other provider. A reverse switch to Square
requires resolving `activeFinixCalls`; never clear counters just to unblock checkout.
A returned Square reference ends that RPC lease, not proof that its payment/link is
settled: the operational link drain remains mandatory. Historical webhooks/refunds
must stay available. Rollback disables entry, preserves reconciliation and stored
orders, and does not automatically re-enable Square.

CRM PR #32 deployment is a separate Platform-owned release: routes, merchant/key
bindings, workers/webhooks, schema/rules/indexes, private artwork storage and PDF
runtime acceptance. Approve deployed sandbox website→CRM→provider acceptance before
any coordinated production release. Live payments and historical replay are excluded.

## Remaining blockers and owners

| Owner | Required evidence/decision |
| --- | --- |
| CRM Platform / CAM-291 | Verified deployed commerce hostname/version; dedicated scoped credential; approved sandbox Finix application/merchant and provider reconciliation/webhook configuration. No values in chat. |
| Canvas operations + CAM-290/291 | Real published catalog, authoritative prices/tax/shipping, stock/capacity/turnaround, localized labels/photos/templates and versioned terms URL. Preview fixtures are not launch data. |
| CRM Platform / CAM-233 | Private bucket signed resumable uploads/downloads, approved CORS, and real PNG/JPEG/PDF runtime/provider acceptance. Isolated memory bucket is not deployment evidence. |
| CRM Platform + Website / CAM-292 | External notification sender/receiver and durable callback are currently missing. Canvas remains sole customer notification owner; CRM internal outbox receipt is NOT evidence of an email. Define event recipients and retries, preserving existing website recipients. Additional function deployment scope must be reviewed when implemented. |
| Website + Canvas operations | Recovery email sender delivery, private record retention/cleanup, approved App Check domain/token behavior on the new route and clean release checkout. |
| Canvas operations + both release owners | Square legacy-link audit/drain/revoke, unknown payment reconciliation, counters and sandbox cutover approval. This branch cannot revoke previously issued provider links. |
| CRM Platform | Customer-accessible invoice/receipt download endpoint is not provided by the reviewed contract (order contains an invoice ID). Verified customer account linking is also separate; recovery intentionally grants only one order. |

The coordinated HTTP tests found the staff `review-asset` optional-check schema defect;
CRM owner corrected it in `84f66cb`, which this harness now uses without a workaround.
Contact reuse is not conflated with idempotency: stable retry identity proves the same
order/payment, not readiness of a historical contact backfill. No historical backfill
or lead replay is run by these tests.
