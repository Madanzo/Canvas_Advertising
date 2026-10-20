# Print buyer journey — review candidate, not published

Branch: `codex/canvas-print-buyer-journey`, successor to publication evidence `7cbba91`. Source baseline: approved `47583ca3b248e34c40d0393a42a4db45b401436b`. Original checkout and commerce branch are untouched. Only two existing public pages are proposed: `/large-format-printing-austin` and `/large-format-printing-austin-es`. No new URL, asset, CSS, runtime script, navigation change, backend, payment integration or deployment. All previous publication approvals retain their original scope; this candidate needs new review/authorization.

## Preview and exact copy

English: http://127.0.0.1:3220/large-format-printing-austin

Spanish: http://127.0.0.1:3220/large-format-printing-austin-es

The preview is local-only/noindex, serves only mapped public files, and uses CSP to block backend connections, form submissions and frames. Do not use it to send a real inquiry. Production markup retains the existing form, validation scripts, fields, names, required flags, service option values, success behavior and runtime bytes; only presentation labels/placeholder are changed. Quote-anchor and phone/email paths are reviewable without activation. Contact destinations remain `sales@canvas-advertising.com`, EN `(512) 434-3793`, ES `(512) 945-9783`. We verified destinations/focus, not call delivery or backend form acceptance; no live submission or call occurred.

Exact before/after HTML/copy/metadata is in `exact-copy.patch`, relative to the published printing bytes. Main changes:

* Hero: “PRINT, LAMINATE AND CONTOUR CUT.” / “IMPRESIÓN, LAMINADO Y CORTE DE GRÁFICOS.” Supporting copy requests finished dimensions, quantity, use and artwork status; materials, finishing, timing and fulfillment are confirmed in the project quote.
* Primary action: “Request a print quote” / “Solicitar cotización de impresión” goes to the existing contact section. Direct phone action added beside it, with email and phone repeated near contact.
* Six specification requirements: product/size/quantity, use/surface, material/finish, artwork status, needed date/installer, pickup or ZIP code. Multiple pieces get vehicle/location/panel and version identifiers. No upload or purchasing workflow introduced.
* Four matching visible/schema buyer answers cover material selection, multiple pieces/designs, timing/fulfillment and unfinished artwork. FAQ identity now belongs to each printing page rather than `/partner#faq`.
* Trade-only blind-shipping/discount claims replaced with project-specific finishing/specification/fulfillment guidance. Spanish inherited free-design hero promise removed. No new price, minimum, turnaround, warranty or shipping promise.
* Title/description/OpenGraph/Twitter descriptions aligned in each language; EN/ES canonicals and hreflang retained. Existing cleared published hero image and capabilities reused; no new customer/result/certification claim or unpublished media.

## Buyer-intent ownership

| Existing destination | Intent | This package |
|---|---|---|
| Printing EN/ES | Product specifications and project quote | Two-page candidate |
| Partner EN/ES | Trade/overflow production for shops | Contextual link only; current live bytes differ from old checkout source, so no overwrite |
| Commercial fleet EN/ES | Fleet planning/installation | Separate next candidate; no edits here |
| Artwork checklist EN/ES | Organize print-ready dimensions, panels and versions | Linked existing resource; improvement remains next milestone |

CA-01 trade/overflow maps to partner EN, CA-02 artwork to the existing checklist, CA-03 Spanish production inquiries to printing ES. These are website intent mappings, not social/outreach publication. Existing invoicing/payment arrangements remain Camilo's human-managed process; there is no Finix dependency.

## Evidence and release boundary

37 affected local checks: six buyer-journey tests plus 31 artifact-guard regressions. Dedicated credential-free hosted workflow added. Historical `seo-release` tests bind immutable first-release gzip files and are not valid assertions that successor HTML equals those old bytes; that job is excluded only for this named successor PR, which has the dedicated suite. Old test/artifact records are not rewritten.

Read-only origin check confirmed the four first-release pages still match approved 47583ca raw hashes. Existing trade/artwork destinations returned200. Browser acceptance and hosted run are recorded separately in the Linear handoff. No full public release package or rollback authorization is inferred from this source preview. Any proposed release must capture the current complete sanitized live map/config, replace only these two paths, retain140 others, run the metadata artifact guard and stop on drift. Never deploy the checkout or restore metadata.

Remaining owner decisions: approve/revise bilingual offer wording and contact presentation; confirm project-specific commercial terms during real quoting. New customer proof requires clearance. Query opportunities are not demand guarantees; qualified quote requests and actual accepted work remain unmeasured. No deploy/indexing request/profile edit/customer outreach/CRM activation.
