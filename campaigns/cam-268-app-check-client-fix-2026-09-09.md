# CAM-268 App Check client recovery

Status: prepared on an isolated branch; not deployed. App Check enforcement
remains disabled.

## Evidence

- All 14 MISSING `createLeadUploadSession` verification entries occurred before
  the App Check monitoring release. The release verification produced one VALID
  request at `2026-09-08T03:04:13.858174Z`.
- Three MISSING `submitPublicLead` entries were pre-release controlled tests.
  One post-release MISSING request at `2026-09-08T21:05:27.740974Z` completed
  successfully and maps by timestamp to a genuine saved quote. It is consistent
  with a page opened or cached before the release; logs expose no user agent or
  page-version field, so that attribution cannot be made stronger.
- No INVALID verification entries were observed. No evidence currently
  distinguishes automated callable traffic because every observed submission
  maps to controlled testing or a saved quote.

## Confirmed client defect and correction

Production pages do not use one Firebase compat version consistently. The quote
pages load Firebase core/services `9.22.0` but App Check `10.12.2`; other form
pages load `10.12.2` core but omit Functions, and some omit Storage. The existing
client silently skips App Check when its provider class is unavailable and can
then invoke a callable without a token.

The corrected shared client dynamically loads App Check, Functions, and Storage
from the same version as the already-loaded Firebase core. It activates
reCAPTCHA Enterprise with automatic refresh, explicitly obtains the initial
token, and only then permits either protected callable. Token acquisition
failure prevents an unverified request and leaves existing form error/retry
behavior in control.

## Exact deployment scope for approval

Deploy Hosting only, using the current live Hosting version as the source and
overlaying only:

1. `js/firebase-config.js` from this branch under a new cache-busted URL.
2. Mechanical `firebase-config.js` query-string replacements in the currently
   deployed HTML files that already reference that shared client.

Do not deploy Functions, Firestore Rules, Storage Rules, CRM code, or unrelated
workspace files. Do not enable App Check enforcement. Preserve the current
`js/main.20260907b.min.js` form behavior and all notification paths.

After approval and deployment, establish a fresh timestamp boundary. Run one
normal no-file quote and one authorized upload quote from the production domain,
then compare only verification entries after that boundary. Both
`submitPublicLead` and `createLeadUploadSession` must report VALID before an
enforcement recommendation is considered.
