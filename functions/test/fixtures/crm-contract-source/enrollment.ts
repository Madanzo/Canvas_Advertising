// Whether a committed intake should create a CRM communications outbox entry.
//
// THE DESIGN DECISION, recorded because it is the load-bearing one.
//
// The outbox entry is created inside the EXISTING intake transaction, not by a
// separate handoff route. Two reasons:
//
//   * Atomicity. `executeIntake` already commits lead, contact, opportunity,
//     activity, idempotency, delivery and audit together. A second route means
//     a second transaction, and the lead/outbox pair stops being atomic — which
//     is precisely the flaw already recorded against the website side, where
//     outbox creation is a separate onCreate trigger that can fail after the
//     lead commits.
//   * One path. A separate route accepting the same submission is a second way
//     to create a lead, and two creation paths for one event is how duplicates
//     arrive.
//
// The supplemental draft reaches the same conclusion: "Integrate notification
// intent creation into the existing intake transaction."
//
// OWNERSHIP IS SERVER STATE. The envelope carries `notificationOwner`, and it
// authorises nothing. It is validated AGAINST the tenant's stored policy, and a
// mismatch is a refusal rather than a transfer. A visitor-reachable field that
// could move ownership would let the website hand itself CRM sending rights by
// asserting them.

import { canMessage, type ContactConsent } from "@/lib/crm/contacts";

export const ENROLLMENT_REFUSALS = [
  "policy_missing",
  "communications_disabled",
  "readiness_not_approved",
  "owner_is_not_crm",
  "envelope_owner_mismatch",
  "policy_version_mismatch",
  "transition_id_mismatch",
  "captured_before_cutover",
  "captured_in_future",
  "test_suppressed",
  "no_consent",
  "purpose_not_owned",
] as const;
export type EnrollmentRefusal = (typeof ENROLLMENT_REFUSALS)[number];

/** The tenant's stored communications policy. Server-written; never from a request. */
export interface CommunicationsPolicy {
  enabled: boolean;
  /** A human approved readiness. Separate from `enabled` so configuration alone
   *  cannot start communications. */
  readinessApproved: boolean;
  notificationOwner: "website" | "crm";
  /** Pins the agreed contract version between website and CRM. */
  policyVersion: number;
  /** The exact transition this epoch belongs to. */
  transitionId: string;
  /** Only records captured at or after this instant may enrol. No backfill. */
  cutoverAt: string;
  /**
   * The EXACT events the CRM owns. Ownership is per purpose, never global.
   *
   * `notificationOwner` alone is too coarse to describe the cutover we are
   * actually proposing. The CRM covers one event — `lead_received`. It has no
   * booking trigger, no reminder scheduler, no campaign path and no manual
   * send. A single tenant-wide "crm" flag would let a policy edit imply the CRM
   * had taken over things it cannot do, and the failure mode is silence: no
   * booking confirmation from either side, and nothing to notice it.
   *
   * So the purpose must be listed here to enrol. An empty or missing list
   * enrols nothing. Widening the scope is a deliberate edit to this field with
   * a matching implementation behind it, not a side effect of flipping owner.
   */
  ownedPurposes: string[];
}

export const CURRENT_POLICY_VERSION = 1;

/**
 * The only purpose the CRM implements today.
 *
 * Everything else on Canvas — booking confirmations, appointment reminders,
 * the follow-up ladder, campaigns, direct messages — stays website-owned.
 */
export const LEAD_RECEIVED = "lead_received";

export interface EnrollmentEnvelope {
  /** Advisory only. Validated against policy; never authorises. */
  notificationOwner?: string;
  policyVersion?: number;
  transitionId?: string;
  /** Server-verified capture time, ISO. */
  capturedAt?: string;
  /** Server-resolved suppression for controlled tests. */
  testSuppressed?: boolean;
}

export type EnrollmentDecision =
  | { enroll: true; transitionId: string }
  | { enroll: false; refusal: EnrollmentRefusal };

/**
 * Decide whether to enrol this submission for CRM-owned communications.
 *
 * Every missing field fails closed. The order puts server policy first, so a
 * tenant that has not switched communications on is refused before anything
 * about the envelope is considered — an envelope cannot talk its way past a
 * disabled tenant.
 */
export function decideEnrollment(args: {
  policy: CommunicationsPolicy | null | undefined;
  envelope: EnrollmentEnvelope;
  consent: ContactConsent | undefined | null;
  channel: "sms" | "email";
  /** Which event this is. Must be listed in the policy's `ownedPurposes`. */
  purpose: string;
  /**
   * The SERVER's clock at the moment the request was received. Required.
   *
   * `capturedAt` arrives over the wire. Comparing it only against the cutover
   * would let a future-dated value authorise enrolment for a record that was
   * never captured post-cutover — the one direction a caller can push a
   * timestamp to gain something. Bounding it above by the server clock removes
   * that, and is the check the supplemental draft's envelope parser performs
   * that this path was missing.
   */
  serverReceivedAt: Date;
}): EnrollmentDecision {
  const { policy, envelope, consent, channel, purpose } = args;

  if (!policy) return { enroll: false, refusal: "policy_missing" };
  if (policy.enabled !== true) return { enroll: false, refusal: "communications_disabled" };
  if (policy.readinessApproved !== true) return { enroll: false, refusal: "readiness_not_approved" };
  if (policy.notificationOwner !== "crm") return { enroll: false, refusal: "owner_is_not_crm" };

  // Per-purpose ownership, checked as server policy — before anything in the
  // envelope is read. A tenant flipped to "crm" still owns only what is listed.
  if (!Array.isArray(policy.ownedPurposes) || !policy.ownedPurposes.includes(purpose)) {
    return { enroll: false, refusal: "purpose_not_owned" };
  }

  // The envelope must AGREE with the policy. Disagreement is a refusal, never a
  // transfer: an incoming "crm" against a policy that says "website" means the
  // website believes something the CRM has not authorised.
  if (envelope.notificationOwner !== undefined && envelope.notificationOwner !== policy.notificationOwner) {
    return { enroll: false, refusal: "envelope_owner_mismatch" };
  }
  if (policy.policyVersion !== CURRENT_POLICY_VERSION) {
    return { enroll: false, refusal: "policy_version_mismatch" };
  }
  if (envelope.policyVersion !== undefined && envelope.policyVersion !== policy.policyVersion) {
    return { enroll: false, refusal: "policy_version_mismatch" };
  }
  if (!policy.transitionId || envelope.transitionId !== policy.transitionId) {
    return { enroll: false, refusal: "transition_id_mismatch" };
  }

  // No backfill, ever. A record captured before the cutover belongs to the
  // website epoch, and enrolling it would be a historical replay by another name.
  const capturedAt = Date.parse(envelope.capturedAt ?? "");
  const cutoverAt = Date.parse(policy.cutoverAt ?? "");
  const serverNow = args.serverReceivedAt.getTime();
  if (!Number.isFinite(capturedAt) || !Number.isFinite(cutoverAt) || capturedAt < cutoverAt) {
    return { enroll: false, refusal: "captured_before_cutover" };
  }
  // A capture time cannot be in the future. Without this, a caller able to
  // influence `capturedAt` could set it forward and enrol a record that the
  // cutover was meant to exclude — the timestamp would be authorising itself.
  if (!Number.isFinite(serverNow) || capturedAt > serverNow) {
    return { enroll: false, refusal: "captured_in_future" };
  }

  // A suppressed controlled test enrols nothing, whatever the owner says.
  if (envelope.testSuppressed === true) return { enroll: false, refusal: "test_suppressed" };

  if (!canMessage(consent, channel)) return { enroll: false, refusal: "no_consent" };

  return { enroll: true, transitionId: policy.transitionId };
}

/** Tenant-scoped, server-written. Client writes are denied in firestore.rules. */
export function communicationsOutboxPath(tenantId: string): string {
  return `tenants/${tenantId}/canvasCommunicationOutbox`;
}

export function communicationsPolicyPath(tenantId: string): string {
  return `tenants/${tenantId}/integrationPolicies`;
}

/**
 * Deterministic outbox id.
 *
 * Derived from the tenant, the source submission and the purpose — NOT from the
 * transition id. Including the transition would mint a fresh id after a policy
 * edit, re-enrolling a submission that was already enrolled. The supplemental
 * draft excludes it for the same reason.
 */
export function outboxDocId(args: { externalId: string; channel: string; purpose: string }): string {
  return `${args.externalId}:${args.channel}:${args.purpose}`.replace(/[^\w.:@+-]/g, "_").slice(0, 200);
}
