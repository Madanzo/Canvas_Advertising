# Canvas quote request redesign

Draft implementation only. No deployment, new production submission, CRM configuration change, notification recovery or historical replay.

## Completed pre-redesign production baseline

Recorded separately; these tests were not repeated:

- Website persistence and upload verification: passed.
- App Check: 3 VALID, 0 MISSING, 0 INVALID.
- Notifications: blocked; no sends or deliveries confirmed.
- CRM integration: not validated; legacy trigger failed before forwarding.

Source client `2bf92bc8daab66c307be9e5c12b1c5acf1015470`; Hosting version `04087d48ca157a49`. No-file submission `73318df7-85ec-4e1a-8735-035830279813`; PNG submission `ab25e434-6143-492c-887e-1db422708259`. The shared firebase-config.js is byte-identical to that SHA.

## What changed and why

A five-step bilingual flow covers product, specifications, production, fulfillment, and contact/review. Installer-ready wrap panels and wholesale printing come first. Vehicle fields appear only for commercial vehicle wraps. Other products collect up to ten finished sizes with explicit inches/feet/cm/mm and integer quantity; the displayed total is square footage, never price. Measurement help bypasses dimensions without inventing them. Materials, lamination, and installation options depend on the chosen product. Pickup does not ask for a ZIP; delivery, shipping and installation do. Dates/rush work are requests subject to confirmation.

The result screen appears only after a successful callable response and displays the saved ID. Failure retains the frozen request for an explicit retry, with the same ID and uploaded-file association. Buttons prevent parallel submission. Retrying a lost submit response does not re-upload files or change the payload. No files or contact data are written to browser persistent storage; retention lasts within the current tab. Reloading after an uncertain result is not a durable recovery mechanism and should be resolved using the submission record rather than submitting a new quote.

## Verified prior behavior

Inspected all ten product selections on the live quote page without submitting. Vehicle panels, replacement panels and fleet graphics selected vehicle mode; wholesale, decals, windows, murals, banners and Ricoh selected custom dimensions. **Coverage and vehicle wrap finish remained visible for all ten**, including banners/cards. Every selection displayed an automatic total and the same 2–3-business-day production promise. Source of `js/main.20260907b.min.js` was checked against its live Hosting compressed hash.

The former production request posts `service: 'Vinyl Print Production'` for every product, with product context in auxiliary fields. Pricing mixes vehicle-area/multiplier logic with print-only presets; quantity is free text. No approved product-specific pricing schedule was found in the reviewed sources. The redesign therefore removes all automatic prices/discounts, inclusions and turnaround promises from these two quote pages. Other pages and pricing flows are not changed.

## Exact ten-service mapping

Authoritative source: `CANVAS_VISUAL_PRODUCTION_PRESET` in `lib/leads/services.ts` and `docs/WEBSITE_LEAD_INTEGRATION.md`, CRM repository `merkad-agency-canvas`, reviewed clean commit `d54bd556c42906905b127cfb3710738915a9ca5a`. This is the Canvas preset, not Phantom's WRAP_SERVICE_PRESET. Existing Canvas adapter mapping documentation corroborates the ten labels.

Both HTML locales use the same canonical value in `service` and `productionRequest.serviceId`. Spanish labels are presentation only. The adapter maps canonical keys to the documented CRM labels; the CRM preset resolves those labels to the same keys. All older Canvas aliases remain intact.

| Stable key | Documented CRM label |
| --- | --- |
| `vehicle_wraps` | Vehicle Wraps |
| `vinyl_large_format_printing` | Vinyl & Large-Format Printing |
| `window_graphics` | Perforated Window Vinyl / Storefront Glass |
| `wall_murals` | Wall Murals & Interior Vinyl |
| `contour_cut_decals` | Contour-Cut Decals |
| `cutting_lamination` | Cutting & Lamination |
| `print_collateral` | Flyers & Business Cards (Secondary) |
| `wholesale_printing` | Print Partner / Wholesale Vinyl Printing |
| `wrap_production_only` | Wrap Production Only |
| `other` | Other |

Banners and printed signs are product details under vinyl_large_format_printing, not new service IDs. Existing `?project=` links are translated explicitly into these keys. Unknown query parameters do not create services.

**CRM owner dependency:** verify and persist this exact preset for the Canvas tenant in Settings → Integrations → Website Leads, with default `other`, while intake remains disabled. Review aliases and actual saved key/label records rather than assuming code presets update persisted settings. The redesign does not repair the existing CRM Settings mismatch and does not authorize credentials or forwarding. The adapter's serviceAllowlistConfirmed remains false.

## Payload and contract preservation

The existing deployed public callable allowlist already accepts `productionRequest`, `businessName`, `locale`, `message`, `productionSummary`, `deadline`, `productionNotes`, `tracking`, `fileUploads` and the existing attribution fields. New specifications are stored under `productionRequest.version=1`; no new top-level backend field is required. Maximum ten piece rows fit the sanitizer's array/depth limits. Tests run the existing sanitizer on every service payload.

The request object preserves service/product, finished width/height/unit/item quantity, total square feet, measurement help, relevant vehicle/count/coverage, material, lamination, artwork state, fulfillment/install flag, ZIP, date/rush, notes and SMS evidence. Irrelevant vehicle/ZIP/dimensions are excluded when not applicable. Company remains businessName. The user-reviewed project summary is explicitly placed in the existing CRM-supported `message`; the original structured object remains in Canvas storage and is still flagged as unsupportedFields by the adapter. The summary intentionally excludes consent evidence, which has its own fields.

The adapter has only two functional changes: canonical service-key aliases and SMS consent lookup from versioned productionRequest, retaining the boatSurvey fallback for existing forms. The exact serializedBody retry function, persisted request bytes, idempotency keys and delivery gates are untouched. No outbox is rewritten.

**Future backend contract dependency:** CRM intake currently lacks typed project pieces/dimensions, company and upload metadata. Those remain structurally available in Canvas and explicitly flagged in the outbox; the human-readable specs/company reach CRM via message. Full typed CRM preservation requires a separately versioned intake schema/adapter extension. Do not mistake summary text for complete structured CRM ingestion.

## Consent and notification launch blocker

The quote form adds an unchecked, optional SMS consent control, separate from submission. Stored evidence includes the exact displayed text, version, boolean, timestamp and locale. Existing boat/visibility consent data is untouched; marketing consent is never inferred.

**The deployed legacy notification workflow ignores SMS consent.** This PR intentionally does not modify that worker or its settings. The checkbox records intent but does not enforce delivery suppression in today's workflow. Production rollout is blocked until a separately reviewed notification change respects explicit consent and has a safe historical-record policy. Missing consent on older records must not be inferred as authorization. The queue/legacy CRM investigation and recovery proposal are a separate report, not a fix in this PR.

## Local preview and verification

Run `npm ci`, `npm run test:quote`, then `npm run preview:quote`.

Open `http://127.0.0.1:4173/quote` or `/quote-es`. The local server substitutes a Firebase compat mock, removes production SDK/analytics scripts, and sets CSP connect-src none/form-action none. It only serves an explicit asset allowlist. This mock is never referenced by production HTML or included in proposed Hosting overlays. Local preview submissions simulate success and uploads, and cannot send real messages. Fonts may load from Google's font CDN.

34 automated checks passed: bilingual service parity, all product visibility/validation, units/quantities, measurement help, payload sanitizer/CRM message preservation, upload/no-upload failure and retry, duplicate suppression, App Check readiness/failure, backend source invariants, and exact CRM retry bytes.

Browser QA: English no-file and Spanish PNG paths completed against local mocks; both showed saved-reference confirmations without console errors. Checked widths 320, 375, 414, 768, 1024, 1440 with no horizontal page overflow. No real recipients were contacted. Screenshots are in `docs/screenshots/`.

## Branch and later deployment scope

This is a stacked draft based on `codex/canvas-app-check-client-fix` at `2bf92bc...`, because main does not contain the deployed secure client or the currently deployed quote pages. Do not merge/deploy the older main branch as a production baseline. The PR diff contains only redesign implementation, adapter compatibility, test/preview tooling and documentation.

**Proposed later Hosting scope, pending separate approval and launch blockers:** `quote.html`, `quote-es.html`, `css/styles.css`, `js/main.js`. Preserve the live firebase-config.js bytes; the quote pages keep its deployed cache-busted URL and use matching Firebase compat 10.12.2 components. No functions/rules/configuration change is part of this Hosting scope.

Because production contains uncommitted/unmerged site work, do not deploy the branch's entire css/styles.css or js/main.js over live. `tools/stage-quote-overlay.cjs` takes verified current-live files plus the full manifest and produces a local four-file overlay: append only the scoped quote CSS, insert a quote-only guard in the verified existing bootstrap, append the quote module, and replace the two quote pages. It refuses mismatched hashes, changed App Check bytes, unexpected bootstrap shape, or already-present patches. All unrelated live CSS/JS prefix content is preserved. A later release must recheck the current live version/configuration and full manifest against this overlay before publishing.

The adapter file is a **separate future Functions change**, not included in the proposed Hosting-only rollout. It needs its own approval/review in the existing disabled adapter rollout. No Functions, Firestore Rules, Storage Rules, indexes, Hosting settings, CRM tenant settings, credentials, or recovery operations were deployed here.

Local overlay staging was verified against Hosting version `04087d48ca157a49`: exactly the four proposed paths were produced, with live shared-asset prefixes preserved. No release was created.
