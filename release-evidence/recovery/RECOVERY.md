# Separate local recovery review — October 20

This is not a production incident and is not part of the four-page upload map. Nothing in the original checkout was restored or modified during this follow-up.

Before searching, current copies, SHA-256, bytes, mtimes and path-limited Git status were preserved under /private/tmp/canvas-recovery-oct20/preserved and report.json for exactly:

- commercial-fleet-wraps-austin.html
- commercial-fleet-wraps-austin-es.html
- large-format-printing-austin.html
- large-format-printing-austin-es.html
- vehicle-wrap-file-preparation-checklist.html
- lista-preparacion-archivos-wrap.html

Bounded search: relevant entries.json metadata in Antigravity history (651 scanned) and VS Code history (one scanned), maximum 2,500 folders/80 versions per resource; no matching filename/resource even after checking moved-path filenames. Cursor history absent. Repository scratch/checkpoints/backups/.history searched to depth three; existing registered commerce worktree checked only for the six top-level paths. No reset/clean/global undo or broad Git-object sweep.

Twelve backup occurrences were found for the four fleet/printing files, representing two unique versions per file. Candidate copies and unified diffs were made outside the checkout. The newer September 10 overlays differ from the currently preserved originals only by a terminal newline. Older backups also differ by the Firebase-config script query version (20260907-app-check-monitor vs 20260910-2bf92bc). These are available historical versions, not proof of the immediate pre-incident local state. No pre-incident backup was found for the two artwork guides within this bounded search.

Two available Codex capture/checkpoint refs resolve to tree 43dafcca79495f7fc9e344338e59b1cdb4c9db1d. The capture ref timestamp is October 20 18:19:51.811 UTC, AFTER the acknowledged incident. Its six files match the current preserved copies exactly. It does not recover or establish the pre-incident state. Available patch-generator records start from captured live bytes and likewise contain no pre-edit untracked-byte snapshot.

All six original hashes were checked again after review and remained unchanged. No restore version was selected or applied. Prior local differences may remain unrecoverable/unproven; do not claim the original state was recovered or that no local work was lost. Keep the incident open for owner disposition or a concrete additional backup source. A proposed restoration must be compared elsewhere and approved before overwriting any newer work.

Detailed local artifacts: /private/tmp/canvas-recovery-oct20/report.json, comparison.json, per-version diffs and candidate copies. Public-source release preparation does not import any of these recovered versions.
