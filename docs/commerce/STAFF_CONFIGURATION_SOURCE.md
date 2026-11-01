# Preserved configurator composition source

Preparation in an isolated website clone of preserved milestone
`92d6f11ffca644a152e95434054ee8a0f211c9c3`. This is not a current-production
baseline or a Hosting package. Do not deploy this repository directory.
The original preserved worktree and published marketing files are unchanged.

`#commerce-app.canvasConfigurationSource` is a read-only input seam for the
future explicitly mounted staff adapter. `snapshot()` returns version
`canvas-commerce-configuration-source.v1`, current catalog version, status and
cloned/frozen configured item IDs, product IDs and supported configurations.
`canvas:configuration-changed` publishes the same projection when cart rendering begins.
The source is retained on persisted pagehide/BFCache return and removed on real
page departure. This lifecycle is tested with DOM events, not claimed as real
browser BFCache acceptance.

Every snapshot is **browser-editable configuration only**. Neither a public mode
switch, catalog version nor a source event authorizes staff access, assigns a
buyer, confirms price or creates a CRM receipt. No server customer record, token,
capability or authoritative total field is exported. User-entered notes remain
user content. Unknown restored item/configuration/dimension/option/variant fields
or incompatible structural types, option values or units refuse the whole projection with `review_required` and no
items. The retained cart is not repaired, erased or silently rewritten. A failed
projection must not be treated as an empty accepted staff order.

Artwork-mode semantics and variant/catalog relationships are not approved by this
projection; the eventual mapper and server must validate them.

The source contains no mutation method. Add, edit, duplicate, remove, local image
reference, original cart persistence and existing proof/order recovery paths stay
in the original configurator. Presence of recovery markup is not proof of its
whole connected behavior. Current prices and all payment/backend contracts are
unchanged by this seam.

## Next connected acceptance

The staff adapter must explicitly map reviewed catalog products/options and units
to the shared owner-pricing/unpriced-draft contract, retaining item/job/design/
placement identities. Unsupported mappings require review, never inferred rates.
It must compose current server-authorized buyer confirmation and V3 save, then
read the saved revision before using the reviewed original-artwork panel. A cart
change invalidates a stale confirmation; it never replaces an uncertain pending
request or reassigns an already preserved original. New server requests remain
disabled unless explicitly mounted into the isolated authenticated environment.
Old #37 commerce operations are not silently replaced by new unpriced handlers.

Backend candidate is reviewed `b6b79f3c39359c21f5549d021eaf32b1288d3377`, separately
from this website source. Actual combined preserved-screen acceptance is still
required; DOM fixtures with an unpriced synthetic catalog establish no CRM
integration. No new selling prices, public offers, authentication simulation
upgrade, production storage, payment, notification, retention or cleanup is added.
The normal 50% deposit policy is unchanged.
