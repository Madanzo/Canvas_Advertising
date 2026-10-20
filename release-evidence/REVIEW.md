# Four-page first release — QA complete, publication ON HOLD

## Pinned identity and boundaries

Release HTML source: `f8a0c11da9b532766c3c1311bfd3906291ecd301`.
Hosted source CI: [run 39471573424](https://github.com/Madanzo/Canvas_Advertising/actions/runs/39471573424), SUCCESS on that exact SHA: eight HTML source checks plus one artifact check. These nine tests are not browser evidence.

Publication package ID: `canvas-seo-first-907d3c0ac82b82c831fb3f71c80d1de47d02628d2ef9dd26e1bc9addc89b8ce7`.
Live baseline and rollback: `projects/canvas-adnvertising/sites/canvas-adnvertising/versions/61df100c11fd1d4f`.
Fresh manifest/configuration captured October 20 at 18:23:21 UTC. This is a local prepared package; no remote version, upload, finalization, release, indexing request or production submission was performed.

The release-source branch remains at the pinned SHA. QA/documentation are maintained separately on `codex/canvas-seo-oct20-release-evidence`; no release HTML is changed by this evidence work. Original checkout untouched during this follow-up. Commerce `92d6f11ffca644a152e95434054ee8a0f211c9c3` and its evidence remain separate. No checkout/payment, staff draft, upload, Functions, Firestore, Storage, IAM/secret, CRM forwarding, notification or App Check enforcement changes.

## Exactly four first-release paths

| Hosting path | Public URL | Scope at the pinned source |
| --- | --- | --- |
| /index.html | / | Homepage claim-safety copy; remove unsupported Zeno badge; qualify warranty/program scope |
| /index-es.html | /index-es | Matching homepage claim-safety scope |
| /large-format-printing-austin.html | /large-format-printing-austin | Correct fragments, quote inputs and artwork-resource link; policy/FAQ changes, with residual claims identified below |
| /large-format-printing-austin-es.html | /large-format-printing-austin-es | Matching printing scope; residual claims and legacy untranslated copy remain |

`technical-package.json` is the four-page proposal. `package.json` is the broader eight-page candidate, NOT this publication allowlist. Its additional fleet EN/ES and existing artwork-checklist EN/ES improvements are a later milestone. Their HTML MUST NOT be uploaded in this first release. The new printing links correctly lead to the currently published checklist resources; they do not depend on publishing the later resource changes.

After an authorized first release, capture its actual new live version as the subsequent milestone's baseline and rollback. Do not reuse the original eight-page candidate as if it were that fresh baseline.

## Browser and public-resource evidence

Local headless Chromium 149.0.7827.55, Playwright 1.61.0:
- Four pinned pages rendered at 320, 375, 414, 768, 1024 and 1440 pixels: 24 page/viewport combinations.
- No document-level horizontal overflow; one H1 per page; no uncaught JavaScript page errors observed.
- Skip links received initial Tab focus. At mobile/tablet widths, Enter opened the menu and Escape closed it with corresponding aria-expanded state. Phone links received keyboard focus and retained EN `tel:+15124343793` / ES `tel:+15129459783`. No phone, SMS, mail or form action was executed.
- Six initial small-homepage image observations were harness timing/lazy-load issues, not confirmed missing assets. A focused six-case image diagnostic brought each image into view and waited: every visible image decoded successfully at 320/375/414 on EN/ES. Raw reports retain the initial observations; do not report their unqualified failure count as the final outcome.
- All 43 explicitly referenced asset URLs returned HTTP 200. Browser-requested resources also succeeded. Tracking/App Check/backend traffic was deliberately blocked; this is not an integration or enforcement test.
- Both printing-page corrected fragment targets exist and scroll into view. Keyboard activation reached the live EN and ES checklist URLs and their matching H1s with HTTP 200.
- Actual public .html and trailing-slash variants returned the expected 301 clean-URL redirects. Quote/quote-es GETs returned 200 with matching canonicals. No live forms/calls were submitted.

Screenshots include full-page snapshots and viewport detail/gallery captures at mobile and desktop widths. Animation/lazy-load behavior makes full-page offscreen screenshots insufficient alone; viewport captures and focused image diagnostics supplement them. This is Chromium coverage, not Safari/Firefox/physical-device, full accessibility, CWV or production lead-delivery certification.

See `qa/browser-report.json`, `qa/image-diagnostic.json`, `qa/reference-check.json`, `qa/contact-check.json`, and `qa/QA.md`. The additional contact pass focused all visible phone/email/quote links at 375px with visible focus outlines, without activation or submission.

## Remaining findings — do not call the pinned release approved

1. **Residual unsupported printing claims**: both printing pages retain the visible “No Minimum Order” heading and “Same-Week Turnaround”/2–3-business-day card promises. Spanish printing also retains the 2–3-day/same-week/next-day answer in FAQ JSON-LD and visible FAQ. These contradict the intended policy withholding. Nine source tests did not establish claim completeness. `qa/proposed-printing-claim-correction.patch` is an UNAPPLIED proposal. Applying it requires a new source SHA, affected tests/CI, exact compressed bytes/package identity and affected browser checks. No replacement price, minimum or deadline is proposed.
2. **Existing public Git metadata exposure**: the fresh live manifest contains 1,876 /.git/ paths, including 1,842 object paths. Bounded GETs to /.git/HEAD and /.git/config returned HTTP 200 on both custom and Firebase origin domains. Contents were not displayed, objects were not downloaded, and no credential contents were read. A four-replacement/zero-deletion overlay necessarily preserves these existing files. Record and obtain a separate containment/credential-risk review decision; do not silently remove them, rotate credentials, or expand this package. No production deployment is authorized.
3. Legacy untranslated Spanish printing sections and unchanged unrelated marketing/material claims are not a site-wide content clearance. They remain separately tracked, not proof that every public claim is verified.

## Full manifest and configuration proof

Local publication directory: `/private/tmp/canvas-seo-publication-f8a0c11`.
It contains only four source HTML files, four exact reviewed gzip upload files, identity, full baseline/proposed file maps, full Hosting configuration, and an offline verifier. No later-milestone HTML or backend source belongs in the upload allowlist.

- Baseline manifest SHA-256 (canonical JSON): `7558b35a9b5c9e0251a30e94b22f1659e02dc46a465f46317e71b8e5ff9b96b0`.
- Proposed manifest SHA-256: `eb03a5b658009fd31402072f6ac4d00e39dafec31b4cf8ebe2b215b2f215d938`.
- Full Hosting configuration SHA-256: `7ba29fbe97ccbc88fe26c25e5551c408af09a9a36eea00e49cf510941ebc68c3`.
- 2,020 paths before and after; exactly four hash replacements, 2,016 identical paths/hashes, zero additions, zero deletions.
- Fresh deployed configuration deep-compares equal to the pinned configuration; both /projects/** and /es/proyectos/** rewrites to serveProjectPage in us-central1 are preserved.
- The offline verifier checks both full maps, path counts, allowlist, raw source hashes, compressed upload hashes, gzip decompression equality and rewrites. The two full maps are local evidence; no claim is made that an uncreated server-side version was listed or verified.

Exact per-path raw/gzip/baseline hashes are in `first-release/identity.json`. Upload the prepared gzip bytes verbatim, not a recompression from a different Node/zlib/OS build. No repository-directory deployment; `--only hosting` alone is not sufficient isolation proof.

## Authorization, publication and rollback procedure

This package is prepared for review, ON HOLD for the findings above, and is NOT production authorization.

1. Resolve the residual-claim source amendment and separate Git-metadata containment decision. A source amendment creates a new package identity and must not be mislabeled f8a0c11.
2. Present final corrected exact SHA, four-path content diff, QA findings/dispositions, full map/config proof and rollback to Camilo for concrete release authorization under CAM-270. Do not wait for CRM/App Check completion; they are separate scopes.
3. After authorization only, from the original project root using the reviewed API release procedure, GET fresh live version/config/file map and stop on any drift. Do not edit or deploy the dirty checkout.
4. Create a dedicated static Hosting version preserving the authorized full map/config and replacing ONLY its four allowed hashes. Upload only the reviewed .gz bytes verbatim. No Functions/rules/backend deployment.
5. List the actual proposed server version's entire file map/config and independently compare it against the approved package. Recheck live did not change. Only then finalize/release with approval.
6. Record release/version/source/time; GET origin and custom public URLs to verify exact bytes and semantic content, canonicals/hreflang, schema, assets, fragments and contact links. Deployment evidence remains distinct from CI.
7. Rollback first release by releasing finalized version 61df100c11fd1d4f to live after verifying it remains the intended rollback. An existing exposure in that version is not repaired by rollback; security containment is separately coordinated.
8. Indexing requests only after actual authorized publication and access/approval; record URL Inspection/index/canonical observations separately. Historical GSC is not current measurement. No ranking or AI-citation guarantee.

## Separate original-checkout recovery record

See `recovery/RECOVERY.md`, not the publication upload map. Six current files and hashes were preserved elsewhere before recovery review. Bounded relevant editor histories, repository backups/worktrees, available patch generators and two Codex capture/checkpoint refs were reviewed. No original file was restored or edited this turn.

Four fleet/printing files have older backups: differences are Firebase-config query version and terminal newline. No pre-incident backup was found for the two artwork guides in this search. The available capture tree is post-incident and matches the current copies, not an unknown pre-incident state. Prior local edits remain unproven; incident disposition remains open.

## Status

Implementation: pinned four-page proposal; eight-page candidate/later milestone clearly separate.
Source CI: exact f8a0c11 hosted success, nine source/artifact tests.
Browser QA: completed Chromium matrix and focused image/link/resource checks; residual content/security findings prevent a clean publication clearance.
Deployment/upload/finalization: NOT performed.
Indexing: NOT requested or verified.
Original checkout: unchanged during this follow-up.
App Check enforcement: unchanged; insufficient callable logs are no enforcement recommendation and not a static-release blocker.

Editorial guidance: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
