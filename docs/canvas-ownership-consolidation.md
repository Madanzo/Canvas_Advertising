# Canvas scoped ownership — consolidation record

Canonical review branch: **`codex/canvas-ownership-canonical`**, a true merge of

* `codex/canvas-purpose-ownership` @ `d77e1f722a5554617058b8799dfe186999989631`
* `codex/canvas-scoped-ownership` @ `ca915c33aa5e5466ebb2eb5809b5510e676e9047`

both based on `cc19a5427f8cf0058f2369fb3d506e5f034fdfe6`. **Both histories are
preserved**; neither branch was reset, force-pushed or overwritten.

## What was incorporated, and what was excluded

### From `canvas-purpose-ownership` — the ownership model. Adopted wholesale.

Its capture-stamp model is materially safer than the other branch's, and this
was settled by running both, not by reading them:

| Scenario | purpose-ownership | scoped-ownership |
|---|---|---|
| Rollback: website sends a receipt for a **CRM-stamped** lead? | **false** ✅ | true ❌ **duplicate** |
| Cutover: website sends a receipt for a **website-stamped** lead? | **true** ✅ | false ❌ **gap** |
| Follow-up still sends for a CRM-stamped lead? | true ✅ | true ✅ |
| `held` lead: follow-up still sends? | **true** ✅ | false ❌ |

The scoped-ownership branch decided ownership from *current configuration*, so a
rollback re-opened receipts the CRM had already taken (duplicate), and a cutover
suppressed receipts for historical leads the CRM would never enrol because they
predate its cutover (gap). Adopted from purpose-ownership instead:

* `capture()` writing an immutable owner onto the lead, and never minting `held`
  — an unready transition stamps `website`, so a receipt is never orphaned.
* `websiteAllowed` returning early for every non-`lead_received` purpose.
* `owner` **derived from** `CANVAS_CRM_OWNED_PURPOSES` rather than a second
  independent env var, which removes the two-flag mismatch entirely.
* `validTimestamp`, the JSON purpose list restricted to exactly
  `["lead_received"]`, `communicationOrigin` persisted on the instance, explicit
  server-supplied `origin` at all four enrolment sites, and the overlay tooling.

### From `scoped-ownership` — the purpose resolution and the execution tests.

* **`functions/step-purpose.js`**: the explicit table, by workflow **and index**.
  It replaces resolution from the trigger. purpose-ownership derived
  `form_submit` → `lead_received` unless `templateId === 'follow_up_no_response'`,
  so **a fourth step added to `wf_welcome` would have become CRM-owned by
  default** — handed to a system with no step to send it with.
* **`test/scoped-ownership-execution.test.js`**: drives the real
  `executeWorkflowStep` and `processInstance` against a queued instance.

### Excluded

* The `scoped-ownership` ownership core, for the table above.
* Its `docs/crm-scoped-ownership.md`, superseded by this file.
* Its `CANVAS_NOTIFICATION_OWNER` flag, replaced by the derived owner.
* Its `functions/node_modules` symlink — **committed in error at `ca915c3`**, an
  absolute path to one machine. Removed, and `.gitignore` corrected: the
  existing `functions/node_modules/` has a trailing slash and does not match a
  symlink, which is how it survived a `git add -A`.

### Changed during consolidation, from neither branch

**A declared `step.purpose` can never escape the receipt gate.** The
scoped-ownership branch gave `step.purpose` absolute precedence; a
purpose-ownership test caught that this lets an arbitrary purpose bypass receipt
suppression. `canvas_workflows` documents are Firestore data editable through
the admin UI, so `step.purpose` is data, not authority. It now applies only
where the server-side resolution is already website-owned, and cannot rescue a
step the table declined to classify.

## Required checks

### 1. Suppressed welcome steps advance the instance, preserving the follow-up

Executed against a **queued** `wf_welcome` instance carrying no purpose field:
steps 0 and 1 return `{ success: true, skipped: true }` so `processInstance`
**advances** to index 1 with a scheduled `nextExecutionAt` and no `error`
status; **step 2 still sends** `follow_up_no_response` with `purpose:
'follow_up'`. A failure return would have parked the instance and stranded every
later website-owned step.

### 2. Persisted evidence prevents both duplicates and gaps

**The capture stamp on the lead is the evidence**, written once at capture and
never rewritten:

* `notificationOwner: 'crm'` ⇒ the website will not send that receipt **ever
  again**, under any later configuration. Rolling back does not re-open it.
  *Prevents duplicates.*
* `notificationOwner: 'website'` (or no stamp at all, for legacy records) ⇒ the
  website keeps that receipt even while the CRM owns `lead_received`. The CRM
  would never enrol it — it predates the cutover — so suppressing it would mean
  nobody sends. *Prevents gaps.*

Ownership is therefore a property of **when the record was captured**, not of
current configuration, so execution-time purpose resolution cannot transfer a
historical queued receipt to the CRM or return a CRM-owned one to the website.
`communicationOrigin`, persisted on the instance at enrolment, is the second
piece of evidence: purpose resolution uses it rather than re-deriving intent
from whatever the workflow document says later.

### 3. Declared precedence and the workflow/index fallback

Order: declared `step.purpose` (constrained as above) → the table by workflow
and index → the origin fallback for workflows the table does not name →
`undefined`, which is not in `PURPOSES`, so `websiteAllowed` refuses it.

**A table row is exhaustive.** An index a row does not cover resolves to
`undefined` rather than falling through to the origin heuristic. Unmapped and
unrecognised purposes therefore cannot acquire CRM ownership; they are
suppressed and the stopped step is noticeable.

### 4. Every shared sending-helper call site

| # | Site | Purpose passed |
|---|---|---|
| 485 | `enrollContactInWorkflow` per-step filter | `stepPurpose(origin, step, workflowId, index)` |
| 487 | `enrollContactInWorkflow` instance gate | `'workflow'` |
| 718 | `executeWorkflowStep` | resolved purpose for that step |
| 773 | `sendEmail` | `options.purpose` |
| 872 | `sendSMS` | `options.purpose` |
| 1029 | `onNewLead` | `'workflow'` |

**No two-argument call remains.** The legacy gate is gone: `websiteAllowed`
refuses anything not in `PURPOSES`, so a two-argument call passes `undefined`
and is refused. That is fail-closed — a missed call site suppresses rather than
sends.

All four enrolment sites supply a server-side origin — `'campaign'`,
`triggerType`, `'booking'` — and an origin outside the allowlist is rejected as
`invalid_communication_origin`. Origin never comes from `contactData` or a
browser.

#### Effect of `held` on each purpose

`capture()` no longer mints `held`; records stamped by the previous
implementation persist and still behave predictably.

| Purpose | `held`-stamped lead |
|---|---|
| `lead_received` | **suppressed** — ownership unresolved, so no receipt |
| `follow_up`, `booking`, `reminder`, `campaign`, `direct_message`, `project_completion`, `workflow` | **sends** |

`deliveryHold` still returns `communications-transition-not-ready` for a `held`
stamp, so its CRM delivery record stays held rather than draining.

### 5. Preserved

* **Consent** — `smsConsent.enrollment` and `smsConsent.canSend` untouched;
  `functions/sms-consent.js` is byte-identical to `cc19a54`.
* **Adapter payload bytes** — the serialized body for the pinned contract
  fixture regenerates to `sha256 46478f4bc9cfc9f8dda4e21f204d53125caf8e89f8ca2a00084b9ce8a65fc366`,
  **byte-identical to the CRM's `tests/fixtures/canvas-cc19a54.json`**. The one
  adapter change adds `&& stamp.purpose === 'lead_received'` to the eligibility
  test; `purpose` lives on the stamp, not on the wire, so no wire byte moves.
* **Timestamps** — `capturedAt` still comes only from the server-written capture
  stamp; `submittedAt` is unchanged and still a separate field.
* **Idempotency keys** — `canvas-lead:{leadId}`, unchanged.
* **No replay** — nothing sweeps, backfills or re-sends. Queued instances are
  not migrated and no byte of them is rewritten; `status: 'held'` delivery
  records stay excluded from the queue.

## Deployment overlays

Regenerated from this head. `tools/verify-split-overlay-fixtures.cjs` passes:
the composed overlay part now embeds the consolidated
`enrollContactInWorkflow`, `processInstance` and `executeWorkflowStep`; part
hashes and byte lengths are recomputed; `step-purpose.js` is added to the pinned
`moduleHashes` for both packages, and `communications-policy.js` re-pinned
(`9d9b8277…` → `8a6560fe…`).

## Rollback

Configuration only. **Nothing here re-sends anything.**

| Lever | Effect |
|---|---|
| `CANVAS_CRM_OWNED_PURPOSES` unset or `[]` | the CRM owns nothing; new captures stamp `website` |
| any `CRM_COMMUNICATIONS_*` gate false | `ready()` false; new captures stamp `website` |
| `CANVAS_COMMUNICATIONS_TRANSITION_ID` cleared | same |
| `CANVAS_WEBSITE_COMMUNICATIONS_PAUSED=true` | all-stop for every website send |

**What rollback does not do.** It does not re-send receipts for leads captured
while the CRM owned `lead_received` — their stamp says `crm` permanently, and
that is deliberate: re-opening them would duplicate messages the CRM already
sent. It does not rewrite any stamp, instance or delivery record, and it does
not release held deliveries. Later website-owned steps were never suppressed, so
there is nothing to restore for them.

Default state today: `CANVAS_CRM_OWNED_PURPOSES` is unset everywhere, so the CRM
owns nothing and every purpose is website-owned.
