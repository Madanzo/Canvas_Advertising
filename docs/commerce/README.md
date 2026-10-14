# Canvas website commerce integration

Integration against CRM PR #37, exact backend head
`bfb94286d540335ee7370162f680a86cf189b9b0`, extending unchanged PR #32
`84f66cb`. Prior website `b87a6ad` tests/CI remain historical evidence for that
baseline, not substituted for the new candidate.
New commerce forwarding and live commerce payments remain disabled; no deployment
or historical replay is authorized. Existing production CRM lead intake/forwarding
is left unchanged by this commerce branch. This statement does not assert its live
configuration or disable an already active lead-delivery path.

## Review preview and contract

### Connected staff drafts / durable pre-purchase artwork — October 14

Acknowledged CAM-291/CAM-292 final handoff and read the pinned
`docs/commerce/STAFF_DRAFT_HANDOFF.md`, generated OpenAPI, request schemas and
actual exported handler. Website adapter, UI and harness are owned here; CRM
extension implementation remains with its assigned owner. No shared CRM files
were changed. Preserve all unresolved costs/pricing decisions below.

The existing configurator/cart now supplies the same configuration to `quote`
and `staff-quote`. Staff selects an existing tenant contact or explicitly creates
one, then saves the canonical unpaid quote/item records; public checkout is NOT
used for draft creation. Both contacts and quotes module access are checked by
CRM on every staff call, including retries. Website `staffDraftsEnabled` defaults
off; CRM has its own independent off-by-default gate. No production flags changed.

Staff signs in through the CRM's existing Google provider using a separate named
Firebase app with `Persistence.NONE`. This neither reuses Canvas Auth as CRM
authority nor adds a provider, anonymous login or account. The short-lived CRM
ID token is forwarded only in the authorization header to the fixed server-side
tenant endpoint. The website first calls the supported CRM contact lookup read
as a live authorization probe; only AFTER CRM verifies token/revocation/current
tenant/both modules does it decode the subject to namespace retry persistence.
Decoded claims never authorize access. CRM rechecks the actual requested operation;
no successful receipt bypasses current membership. Tokens are never persisted.

Exact staff mutation bytes are durably saved before delivery in server-only
`canvas_commerce_private/staff_intent_*`, scoped to the CRM-verified UID,
operation and attempt. Refreshing a token/new worker keeps the same subject/body.
Browser pending state contains operation/attempt only, not contact details or
tokens. Lost responses use the persisted body; changed bytes conflict. A request
confirmed absent from website persistence can be re-entered rather than leaving
the UI permanently stuck. Public quote retries also keep their original attempt.

Buyer assignment accepts a **buyer-generated handoff ticket**, not a visitor
customerId or email match. `buyer-ticket` derives identity from the existing
HttpOnly guest session, rejects order-only recovery sessions, rate-limits issuance,
and returns a random 30-minute code for deliberate sharing with authorized staff.
Only its digest/customer/expiry/binding are saved in `buyer_*`. Staff submits the
quote/hash/request + code; binding that one ticket and persisting the exact derived
CRM assignment request is atomic. Retries use that saved body without requiring
the code again; transaction failure consumes neither. It cannot assign a second
draft under a different request. The code is not a customer capability and grants
no draft access without staff authorization. No share email/message is sent.

Both interfaces save source artwork against quote/item/side/design/allocated
quantity using the actual draft handlers. Server upload history restores pending
and completed session IDs after refresh and staff→buyer handoff. Same-file retries
first recover completion, then reserve/resume the same version; signed transport
URLs are held only for the current operation. Replacements use new request IDs,
retain immutable historical versions and cannot be overwritten by an old retry.
Local reference preview remains ephemeral and distinct from these durable originals.
Editing configuration hides the old draft; it never silently copies its artwork
into a new quote. Authorized recovery can still open its exact quote ID.

The buyer opens the assigned quote in the original session and accepts its exact
hash/terms through ordinary checkout. CRM atomically adopts the existing canonical
items/assets/contact and records orderId; pending upload obligations block purchase.
Source files remain originals requiring review/finals/proof; payment, artwork,
approval and production readiness remain separate. No payment call is made by
draft creation or adoption. Synthetic fixtures explicitly use deposit/5000.

New connected preview: `CRM_TEST_ROOT=/private/tmp/canvas-commerce-staff-bfb9428`
with `node -e 'require("./scripts/commerce/preview-server.cjs").startPreview({port:3216})'`,
then `/store` or `/store-es` at `http://127.0.0.1:3216`. The preserved baseline
preview on3210 is not proof of this new backend revision. Preview staff sign-in is
a localhost-only synthetic credential edge, never a production authorization path.

Affected acceptance commands:

```sh
CRM_TEST_ROOT=/private/tmp/canvas-commerce-staff-bfb9428 npm run test:commerce
CRM_TEST_ROOT=/private/tmp/canvas-commerce-staff-bfb9428 \
  npx -y firebase-tools@latest emulators:exec --only firestore,auth \
  --project demo-canvas-commerce-isolated --config .firebase-commerce-emulator.json \
  'GCLOUD_PROJECT=demo-canvas-commerce-isolated node --test scripts/commerce/staff-emulator.test.cjs scripts/commerce/persistence.test.cjs'
```

Use Java21+ for local emulators. Guards reject non-demo/non-loopback environments.
HTTP/browser tests use actual CRM handlers/inspection with serializable stores and
synthetic auth/provider/storage edges. The separate connected emulator test uses
the actual CRM Firestore adapter, tenant resolver, real Auth verification and real
website retry transactions; only machine-key authentication and GCS/provider
boundaries are deterministic. It proves concurrent/lost-response contact/draft
recovery, public/staff pricing parity, each missing-module denial, removed member,
disabled account, server-derived assignment, original upload identity/completion
and atomic adoption, with no duplicate contact/order/payment/lead/work order.
Neither suite proves deployed GCS/IAM/CORS, a Google popup on the production domain,
real Finix sandbox acceptance or customer notification delivery.

Local candidate evidence:37 Functions and36 frontend checks pass; six connected
HTTP/browser/mode scenarios pass across affected reruns, plus two real demo
Auth/Firestore cases. The expanded combined run exposed an assertion counting
quote line subdocuments as extra quotes and an upload test reusing the previous
success announcement before authoritative form replacement. Both assertions were
corrected and affected cases retested; mobile navigation is tested after restoring
the intentionally auto-hidden header. Hosted checks run only offline units,
frontend/syntax and trigger discovery, not these connected/emulator suites.

Release configuration still required (no secret values in chat): verified CRM
hostname/revision and existing dedicated server credential; reviewed public CRM
Firebase `staffAuth` tuple (`projectId`, `authDomain`, `apiKey`, `appId`) and authorized
website domain for the existing Google provider; independent website/CRM staff
flags only after approval. `staffAuth` is projected to those public SDK fields only.
Real catalog/pricing/terms, storage runtime/CORS and provider/reconciliation gates
remain open. This revision still requires the existing `canvasCommerce` handler
plus Hosting; no new proof issuer or staff Firebase Function was added. The earlier
Square guard deployment scope and coordinated drain/cutover remain unchanged.
No rules/Storage/IAM/auth-provider/workflow/deployment change is included. Reconcile
CRM cumulative rules controls separately; inherited PR32 rules are NOT release artifacts.

### Fast Ordering continuation — October 14 approved scope

Historical checkpoint before PR37's handoff: existing reviewed website head was
`83c906c` (runtime `e0f5a74`). The previously
tested CRM head was `84f66cb`; its temporary checkout is now absent, so earlier
connected test evidence is historical, not a fresh assertion of current connectivity.
Current CRM checkout/revision and server-authorized staff contact/draft-quote
operations have been requested on CAM-291 before any backend/shared-file edits.
Do not use purchased checkout to emulate an unpaid staff quote.

Private pricing review: `node scripts/commerce/private-pricing-review.cjs`.
Interactive local-only worksheet: `node scripts/commerce/private-review-server.cjs`
then `http://127.0.0.1:3215/`. It validates Host and same-origin POSTs, does not
persist entered costs or scenarios, and has no public/staff API or publishing action.
Do not treat this loopback worksheet as authenticated deployed staff quote entry.
This offline-only module records all 14 owner-proposed variants, yard-sign tier
boundaries and the pasted unverified shipping schedule. It is excluded from Hosting
and is not imported by browser, public API or CRM delivery code. Supplier costs
remain **unknown**, never inferred from retail prices or the screenshot references.
`reviewMargin` accepts an authoritative quote's pre-tax sales subtotal plus explicit
material, finishing, labor/time, material-waste, packaging, freight and collection
cost inputs. Missing values return no total/margin; an approved zero is distinct
from unknown. Optional margin scenarios are private review, never published price
rules or a second quote/payment/ledger service. Real private costs must not be
committed into this public repository or included in CI logs/public responses.

The four unresolved policies are configurable nulls: minimum area vs charge,
yard-sign sale units/stakes, design-fee scope and shipping applicability/increments.
All 14 variants remain unpublished until operational approval and backend catalog
acceptance. Acrylic contour surcharge basis/thickness/standoff quantities, precise
banner/mesh specification, shipping zones/mixed-cart aggregation/boundary precedence
also need explicit values before enabling those options. No discounts were invented.
Transfers/apparel are outside the initial sellable catalog; earlier synthetic tests
remain regression fixtures, not approval to sell those products.

Normal production deposit requirement remains **50%**. The earlier full-payment
synthetic fixture tests are not permission to change that normal policy. Unpaid
draft, confirmed capture, artwork approval and production eligibility stay separate.
No invoice833 exception, historical promotion, workflow-queue activation, replay,
customer message, live Finix activation or deployment is authorized here.

The configurator now places a local PNG/JPEG reference beside desktop settings,
keeps the desktop order summary sticky, and provides a persistent mobile next-step
bar. The bar displays only an unexpired CRM quote total, never a client-calculated
price; editing invalidates that total. Reference images use ephemeral local blob URLs,
are revoked on product change/page exit, and explicitly are not uploaded, persisted,
approved or assigned production assets. Durable **pre-purchase** artwork was
blocked at that checkpoint; the separate PR37-backed flow above now implements it.
This local reference is not substitute acceptance for that durable flow.
Purchased artwork identity/recovery/proof services remain unchanged.
Unsubmitted configuration drafts now retain catalog version and edit-line identity
across refresh. A changed catalog does not silently apply an old configuration;
editing a restored line updates that line rather than manufacturing a duplicate.
No local reference image bytes/blob URLs, quote prices or staff privileges are saved
in this draft. Prices/availability still require a new authoritative quote.

### Current acceptance audit / owner handoff

| Requirement | Current evidence / remaining dependency |
| --- | --- |
| Private 14-variant review | Offline module + local worksheet; supplied retail proposals and yard tiers retained, all manufacturing costs unknown. Eight costing tests + loopback Host/origin/no-persistence test. Real margin approval awaits explicit supplier/material/finishing/labor/waste/packaging/freight/collection inputs. |
| Original desktop/mobile interface | Local reference/settings beside sticky summary, fixed mobile next action; actual Chrome EN/ES widths and no overflow. Local reference is not durable pre-purchase artwork. |
| Recoverable configuration | Browser refresh/edit retains line ID, discards stale catalog draft, and unavailable restored product cannot offer purchase. Exact purchased order/body/artwork/proof retry behavior retained. |
| Staff fast quote + customer pricing parity | **Implemented/isolated connected acceptance** against pinned PR37; shared configurator and actual pricing/contacts/draft handlers, live CRM authorization on every retry. Real domain Google sign-in and deployment/configuration acceptance remain pending. |
| Durable pre-purchase artwork | **Implemented/isolated connected acceptance**: item/side/design/quantity identity, upload-history recovery, immutable versions, staff→buyer assignment and atomic adoption. Deterministic GCS transport is not deployed bucket/IAM/CORS evidence. |
| Initial real catalog | **Not published**. Four unresolved business policies remain null. Backend fixed option fees do not support acrylic10% contour surcharge; minimumArea applies per piece, not an unconfirmed total-job minimum; flat delivery rules do not implement the pasted shipping matrix. CRM owner must extend/review authoritative rules after bases are confirmed. |
| Normal50% payment distinction | New actual-handler isolated deposit/5000 scenario verifies requiredMinor rounding, exact deposit retry, separate remaining balance and artwork hold. No deployment/published policy altered and no accepted snapshots rewritten. Real Finix sandbox remains a provisioning/acceptance dependency. |
| Review PR/release | Branch pushed; draft creation connector403 is unresolved. Nothing merged/deployed. Existing lead intake/queue/notification ownership and all historical restrictions unchanged. |

Earlier dependency requests are retained in CAM-290/291/292. The final PR37
handoff now confirms extension ownership/contract, acknowledged above. Private
cost worksheet and local blob previews remain independent tools, not substitutes
for the connected staff quotes and durable draft upload acceptance.

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
