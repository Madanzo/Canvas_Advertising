# Explicit staff configuration mapping proposal

`js/canvas-staff-mapping.js` is an unmounted, synchronous preparation helper.
It performs no authentication, API requests, browser persistence, file upload,
price calculation or business mutation. Neither its output nor a mapping profile
is server authorization. The server must still validate tenant/member/buyer
access, current draft revision, trusted catalog/pricing and every calculation.
The existing #37 commerce operations are not replaced or silently downgraded.

Inputs:

- Current `canvas-commerce-configuration-source.v1` snapshot, status
  `configuration_only`, with 1–50 unique configured item identities.
- Explicit `canvas-staff-catalog-mapping.proposal.v1` profile for the exact source
  catalog version. Each source product ID and complete option-value combination
  must match exactly one profile. Profiles contain technical target product and
  option IDs only. Prices, totals and unknown fields are refused.
- Exactly one staff-entered assignment per source line: same line-item ID, job,
  design and placement IDs, explicit installation-review flags and either an
  exact installation height in feet or unknown/null. No IDs are generated,
  renamed, pooled or inferred from a product label.

Output status `prepared_configuration_only` supplies rows for the existing
reviewed staff preparation model, plus separate artwork intent. It is not a saved
or accepted quote. The existing V3 model and authenticated handler remain required.
A failure returns review problems with no partial rows. Missing, duplicate or
orphan assignments, ambiguous/stale profiles, malformed text and unsupported
configuration all require review; the original source is not changed.

Conversions use rational integer arithmetic. Inches/feet and exactly representable
metric dimensions are converted without rounding. A result requiring more than
six fractional inch places, or outside the draft dimension format, needs explicit
inches/production review. For example 25.4 mm becomes exactly 1 inch; 1 cm is not
silently rounded into the draft. Quantity remains a positive whole number within
the server contract limit. Apparel/garment matrices remain outside this mapping.

Literal design brief and notes are retained, with separate labeled sections when
both exist. Limits count Unicode scalars and UTF-8 bytes; text is never truncated.
The downstream V3 model retains its aggregate-note/body and current-artwork rules.
Artwork `later`, `now` or `design_help` is retained separately with
`sourcePreserved: false`. Local image references are not converted into private
receipts, approved artwork or production permission. Actual upload must follow a
saved, currently authorized draft and its stable item/design/placement binding.

Owner option identifiers include unpriced Request-a-quote configurations. Mapping
one does not assign a zero value or accept a subtotal. Shipping remains manually
quoted, tax and other mandatory charges remain reviewed, supplier costs stay
private/unknown and the normal 50% deposit policy is unchanged. Mesh rows preserve
explicit job IDs: this helper neither pools eligible areas nor applies a minimum
per line. Approved server job pricing remains authoritative and unchanged.

## Current evidence and remaining composition

42 affected local tests passed: 32 mapping cases and 10 retained source/page cases.
Report SHA-256:
`c2e2b2c0927592c519f66650fdd4d7fc0e24334fd6f83e54444350383f6b334a`.
Four permanent non-author regression cases first failed against the earlier WIP
(array/object product coercion, sparse input and lone-surrogate notes), then
passed after correction. Earlier report SHA-256:
`a568dacb6cb1f2986a7b68d3ccd151aaa850d22c153c21063a9f901fe30b2eb2`.
Bounded non-author corrected-source review found no remaining material finding;
this is source/DOM preparation, not connected or production acceptance.

Next, mount explicit assignment controls and the reviewed authenticated V3
buyer/draft/original components alongside the preserved branded configurator.
Bind them to current saved revisions, preserve uncertain exact requests during
cart changes, and test the combined EN/ES screen against actual isolated handlers.
No production adapter is bound by this proposal. No deployment, customer records,
payment, notification, retention, cleanup or existing sales-flow changes occur.

## Explicit assignment controls

`js/canvas-staff-assignments.js` supplies default-disabled local controls for job,
unique design, placement and installation-review inputs, alongside the existing
configurator. It has no sign-in, API, file, price or storage operation. Blank
identities are not generated or inferred. Refresh retains values only for the
same stable item ID; a duplicated/new line starts without another line's design.
An edited cart requires explicit refresh before mapping. Failed refresh preserves
local entries but invalidates preparation; it never repairs a business record.
This module is not mounted by the public store pages.

The composed CRM workspace is a separate source candidate and must be tested
against the exact website revision. Simulated component API/authentication is
not actual handler, durable storage or production acceptance. The original
store/cart/reference/proof/recovery implementation remains in place.
