# Pinned browser QA — f8a0c11

Source: f8a0c11da9b532766c3c1311bfd3906291ecd301. This is browser evidence, separate from the nine source/artifact tests and their exact-head hosted CI.

Runtime: local cached Chromium 149.0.7827.55 (headless shell revision 1228), Playwright 1.61.0, macOS x64. Four candidate HTML responses were intercepted at their real production URLs. Public static assets were GET-only. Non-GET, analytics, App Check, callable/auth/database traffic and form/call actions were blocked. No live lead/call, payment, upload or indexing action occurred.

## Completed matrix

All four first-release URLs: 320, 375, 414, 768, 1024 and 1440 px, 900px viewport height (24 combinations). Document width stayed within viewport; one H1; no uncaught page errors. Initial Tab reached skip links; Enter/Escape controlled mobile menus with aria-expanded true/false; phone anchors received keyboard focus with correct EN/ES numbers. Phone links were inspected, not activated.

An additional 375px browser contact pass focused every visible phone, email and quote anchor on all four pages. All accepted keyboard focus with an automatic focus outline; mail links target sales@canvas-advertising.com and quote links resolve to the matching EN/ES route. Hidden menu/conditional CTAs are recorded as hidden rather than mislabeled focus failures. The WhatsApp widget is a form/button interaction, not a navigable anchor in this check; its message submission remains deliberately unexecuted. See contact-check.json.

All 43 explicitly referenced asset URLs returned 200. All 52 resources requested in the main browser run returned 200. Six initial small-homepage image flags were not sufficient evidence of missing images: rapid/smooth scrolling and lazy loading left them unloaded during the first measurement. A focused follow-up at 320/375/414 on both homepages brought each visible image into view and waited; all images decoded and no visible failures remained. Reports preserve both initial observations and follow-up resolution.

Keyboard activation of #main-content and #types found exactly one target on each printing page and scrolled to it. Smooth-scroll JS need not append a URL hash. Keyboard navigation to EN/ES artwork resources reached their correct clean URLs/H1 and HTTP 200. Existing .html/trailing-slash forms 301 to the correct clean URLs. Both quote URLs GET 200 with correct canonical; no form was submitted.

## Visual review and findings

Mobile/desktop detail and gallery screenshots were inspected. Candidate copy fits the existing layout; published images render. Full-page screenshots alone omit offscreen reveal animations and are supplemented with viewport captures. Original fixed contact widgets and legacy mixed-language Spanish printing content are unchanged, not a redesign/accessibility clearance.

Browser-visible release-blocking content findings:

- Both printing pages still show **No Minimum Order**, contradicting the scoped/minimum-confirmation paragraph.
- Both printing cards retain **Same-Week Turnaround** and 2–3-day promises. The Spanish printing visible FAQ/JSON-LD additionally retains same-week/next-day promises.
- See proposed-printing-claim-correction.patch; it is UNAPPLIED and not part of f8a0c11. A new source/package/CI/affected-QA identity is needed before publishing amended HTML.

Separate full-manifest security finding: existing /.git/HEAD and /.git/config are publicly HTTP 200 on custom and Firebase domains. No content was displayed or Git objects downloaded. This needs a separate containment decision; the four-replacement/zero-deletion proposal intentionally has not been broadened.

## Limits / disposition

**QA performed; publication ON HOLD**, not blanket pass. This Chromium run does not prove Safari/Firefox/physical devices, full accessibility, Core Web Vitals, notification delivery, CRM connectivity or App Check readiness. Do not substitute source tests for this browser evidence or label local intercepted HTML as deployed.

Raw evidence: browser-report.json, image-diagnostic.json, reference-check.json. Original screenshots and initial harness observations remain at /private/tmp/canvas-seo-qa-f8a0c11. The local publication bundle includes review screenshots. No production authorization is implied.
