# Canvas Advertising → Merkad lead adapter field mapping

Source contract reviewed from Merkad branch `integration/cam-213-220-website-lead-intake` at commit `26140ea`.

Forwarding status: **disabled**. This mapping is implemented for mock testing but the service translations remain unconfirmed against the deployed Canvas tenant allowlist.

## Endpoint and transport

| Item | Adapter behavior |
|---|---|
| Route | `{MERKAD_LEADS_BASE_URL}/api/v1/tenants/{MERKAD_LEADS_TENANT_SLUG}/leads/intake` |
| Authentication | Server-only `Authorization: Bearer mk_live_{MERKAD_LEADS_KEY_ID}.{MERKAD_LEADS_SECRET}` |
| Idempotency | `Idempotency-Key: canvas-lead:{submissionId}` |
| Request body | Serialized exactly once when the outbox record is created; the stored string is replayed byte-for-byte |
| Honeypot | CRM `website` is always `""`; Canvas customer/business URLs are never copied into it |
| Size | CRM maximum is 64 KB; deployment verification must confirm mapped payloads remain below it |

## Field mapping

| Canvas source | CRM request field | Status / transformation |
|---|---|---|
| `name`, or joined `firstName` + `lastName` | `fullName` | Direct/fallback |
| `firstName` | `firstName` | Direct |
| `lastName` | `lastName` | Direct |
| `email` | `email` | Direct |
| `phone` | `phone` | Direct |
| `service` | `requestedService` | Explicit translation table below; deployment blocked until tenant allowlist is confirmed |
| `estimatedPrice` | `estimatedBudget` | Direct; CRM normalizes numeric/range input |
| `deadline`, then `boatSurvey.timeframe` | `desiredTimeline` | First available value |
| `message` | `message` | Direct; nested project details are not appended silently |
| `boatSurvey.contactMethod` | `preferredContactMethod` | Lowercase only when `phone`, `text`, or `email` |
| none | `marketingConsent` | Always `false`; never inferred |
| `boatSurvey.smsConsent` | `smsConsent` | `true` only when explicitly true; otherwise false |
| `page` | `attribution.pageUrl` | Direct |
| `sourcePage`, then `page` | `attribution.landingPage` | First available value |
| `tracking.utm_source` / `utmSource` | `attribution.utmSource` | First available value |
| `tracking.utm_medium` / `utmMedium` | `attribution.utmMedium` | First available value |
| `tracking.utm_campaign` / `utmCampaign` | `attribution.utmCampaign` | First available value |
| `tracking.utm_content` / `utmContent` | `attribution.utmContent` | First available value |
| `tracking.utm_term` / `utmTerm` | `attribution.utmTerm` | First available value |
| `tracking.gclid` | `attribution.gclid` | Direct |
| `referrer` | `attribution.referrer` | Direct |
| lead `createdAt`, otherwise trigger timestamp | `submittedAt` | ISO-8601 string |
| constant | `sourceSystem` | `canvas-advertising.com` |
| Canvas lead document ID | `externalDocId` | Same stable submission ID used by idempotency |
| none | `turnstileVerified` | `null`; App Check is not misrepresented as Turnstile |
| none | `website` | Always empty; CRM honeypot |

The CRM requires a name and at least one of email/phone. Canvas validation already requires name and phone, so accepted Canvas submissions satisfy that minimum.

## Proposed service translation

These translations target labels in `CANVAS_VISUAL_PRODUCTION_PRESET` on the reviewed CRM branch. They are not authorization to enable delivery.

| CRM service | Canvas `service` values mapped to it |
|---|---|
| `Vehicle Wraps` | `vehicle-wraps`, `vehicle-wrap`, `partial-wrap`, `color-change`, `fleet`, `fleet-wrap`, `van`, `truck`, `box-truck`, `food-truck`, `food-trailer`, `concession-trailer` |
| `Vinyl & Large-Format Printing` | `large-format`, `Vinyl Print Production`, `Print and Ship Vinyl Production` |
| `Perforated Window Vinyl / Storefront Glass` | `perforated-window-vinyl`, `storefront-signage` |
| `Wall Murals & Interior Vinyl` | `interior-branding` |
| `Contour-Cut Decals` | `decals` |
| `Cutting & Lamination` | `lamination-cutting`, `cutting-only` |
| `Flyers & Business Cards (Secondary)` | `short-run-digital` |
| `Print Partner / Wholesale Vinyl Printing` | `print-partner`, `full-service` |
| `Wrap Production Only` | `wrap-production` |
| `Other` | `other`, `General Inquiry`, `WhatsApp Inquiry`, `Marine and Boat Wraps`, `Basic Visibility Package`, `Private Feedback` |

An unmapped value is marked `UNSUPPORTED_SERVICE_MAPPING` and is never sent.

## Explicitly unsupported—not silently dropped

The outbox stores an `unsupportedFields[]` entry whenever a submitted value exists for any item below. These values remain safely stored on the original `canvas_leads` document.

| Canvas field | Reason |
|---|---|
| `businessName`, `businessType` | No CRM intake fields in the reviewed contract |
| Canvas `website` | CRM field with this name is a honeypot |
| `projectType`, `materialType`, `finishType`, `quantity`, `deliveryMethod`, `productionNotes` | No matching CRM intake fields |
| `method`, `coverage`, `vehicleSize`, `wrapFinish`, `customWidth`, `customHeight`, `productionSummary` | No exact approved CRM fields |
| `productionRequest` | CRM does not accept this nested project object |
| `visibilityPackage` | CRM does not accept this nested object or its privacy acknowledgement |
| `boatSurvey` | CRM does not accept the nested object; only SMS consent, contact preference, timeframe are individually mapped |
| `fileUploads` | CRM intake has no upload-metadata field |
| `privacyConsent` nested in boat/visibility forms | CRM contract has marketing and SMS consent only; privacy acknowledgement is not broadened into either |

## Response handling

- `201 created`: accepted.
- `201 rejected_spam`: durably accepted by CRM but flagged; no contact/opportunity expected.
- `200 duplicate_ignored`: accepted duplicate; original IDs retained.
- `409 idempotency_conflict`: terminal conflict; never retried.
- `400`, `401`, `403`, `422`: terminal validation/configuration failure; details recorded.
- `429`, `500`, network failure, and timeout: retry with exponential backoff and the exact stored bytes.

## Replay policy

Outbox records created while forwarding is disabled have status `held`. The scheduled worker excludes `held` records, so enabling future delivery will not replay them. Any replay requires a separately reviewed, explicit migration after the live contract is verified.
