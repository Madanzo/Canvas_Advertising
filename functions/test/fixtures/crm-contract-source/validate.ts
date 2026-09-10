// Inbound payload validation + normalization (CAM-213).
//
// Everything crossing the network boundary is untrusted, including the payload
// our own bridge sends: a website form is edited by whoever is looking at it.
// So every field is length-capped, type-checked and normalized here, once,
// before anything downstream sees it.
//
// Two different failure kinds, deliberately separated because they mean
// different things to the caller:
//   400 — the request is not usable at all (not JSON, no idempotency key)
//   422 — the request parsed but a field is wrong (bad email, junk year)
// The endpoint maps them; this module just reports which fields failed.

import { z } from "zod";
import { isValidEmail, normalizeEmail } from "@/lib/crm/shared";
import {
  EMPTY_ATTRIBUTION,
  resolvePreferredContactMethod,
  type LeadAttribution,
  type LeadSubmission,
} from "./leads";

/** Field caps. Generous for humans, closed for anyone pasting a payload bomb. */
export const FIELD_LIMITS = {
  name: 200,
  email: 320, // RFC-max addressable length
  phone: 40,
  short: 120, // make / model / colour / timeline
  service: 200,
  message: 5000,
  url: 2048,
  utm: 300,
} as const;

/** Whole-body cap, enforced by the endpoint before parsing. */
export const MAX_PAYLOAD_BYTES = 64 * 1024;

export interface FieldError {
  field: string;
  code: string;
}

export type ValidationResult =
  | { ok: true; value: LeadSubmission }
  | { ok: false; errors: FieldError[] };

const trimmed = (max: number) =>
  z.preprocess((v) => (typeof v === "string" ? v.trim() : v === null || v === undefined ? "" : String(v).trim()), z.string().max(max));

const optionalBool = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return ["true", "yes", "1", "on"].includes(v.trim().toLowerCase());
  if (typeof v === "number") return v === 1;
  return false;
}, z.boolean());

const attributionSchema = z.object({
  pageUrl: trimmed(FIELD_LIMITS.url).optional(),
  landingPage: trimmed(FIELD_LIMITS.url).optional(),
  utmSource: trimmed(FIELD_LIMITS.utm).optional(),
  utmMedium: trimmed(FIELD_LIMITS.utm).optional(),
  utmCampaign: trimmed(FIELD_LIMITS.utm).optional(),
  utmContent: trimmed(FIELD_LIMITS.utm).optional(),
  utmTerm: trimmed(FIELD_LIMITS.utm).optional(),
  gclid: trimmed(FIELD_LIMITS.utm).optional(),
  referrer: trimmed(FIELD_LIMITS.url).optional(),
});

export const intakeSchema = z.object({
  fullName: trimmed(FIELD_LIMITS.name).optional(),
  firstName: trimmed(FIELD_LIMITS.name).optional(),
  lastName: trimmed(FIELD_LIMITS.name).optional(),
  email: trimmed(FIELD_LIMITS.email).optional(),
  phone: trimmed(FIELD_LIMITS.phone).optional(),

  vehicleYear: z.preprocess((v) => (v === null || v === undefined ? "" : String(v).trim()), z.string().max(10)).optional(),
  vehicleMake: trimmed(FIELD_LIMITS.short).optional(),
  vehicleModel: trimmed(FIELD_LIMITS.short).optional(),
  wrapStyle: trimmed(FIELD_LIMITS.short).optional(),
  wrapColor: trimmed(FIELD_LIMITS.short).optional(),

  requestedService: trimmed(FIELD_LIMITS.service).optional(),
  estimatedBudget: z.union([z.string().max(60), z.number(), z.null()]).optional(),
  desiredTimeline: trimmed(FIELD_LIMITS.short).optional(),
  message: trimmed(FIELD_LIMITS.message).optional(),
  preferredContactMethod: trimmed(40).optional(),

  marketingConsent: optionalBool.optional(),
  smsConsent: optionalBool.optional(),

  attribution: attributionSchema.optional(),
  submittedAt: z.union([z.string().max(60), z.number(), z.null()]).optional(),
  sourceSystem: trimmed(FIELD_LIMITS.short).optional(),
  externalDocId: trimmed(FIELD_LIMITS.short).optional(),

  // Anti-spam. `website` is a honeypot: a real form keeps it hidden and empty.
  website: trimmed(FIELD_LIMITS.url).optional(),
  // The bridge verifies the Cloudflare Turnstile token against its own origin
  // and reports the verdict; the raw token never reaches the CRM because it is
  // not ours to validate.
  turnstileVerified: z.union([z.boolean(), z.null()]).optional(),
});

export type IntakeInput = z.infer<typeof intakeSchema>;

const YEAR_PATTERN = /^\d{4}$/;

/**
 * Parse a budget a human typed. "$4,500", "4500", "4.5k" and "4,000-6,000" all
 * appear on real forms.
 *
 * A RANGE resolves to its LOW end: the figure lands on an opportunity as an
 * estimate, and forecasting off the optimistic end of every range is how a
 * pipeline quietly inflates. Returns null for anything unparseable — the caller
 * falls back to the tenant's configured default rather than inventing a number.
 */
export function parseBudget(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
  if (typeof value !== "string") return null;

  const text = value.trim().toLowerCase();
  if (!text) return null;

  const matches = text.match(/\d[\d,.]*\s*k?/g);
  if (!matches || matches.length === 0) return null;

  const numbers: number[] = [];
  for (const raw of matches) {
    const isThousands = raw.trim().endsWith("k");
    const cleaned = raw.replace(/k/g, "").replace(/,/g, "").trim();
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n < 0) continue;
    numbers.push(isThousands ? n * 1000 : n);
  }
  if (numbers.length === 0) return null;
  return Math.round(Math.min(...numbers) * 100) / 100;
}

/** ISO 8601, or "" when the caller sent nothing usable. Never throws. */
export function parseSubmittedAt(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Seconds vs milliseconds: anything below ~year 2286 in ms is seconds.
    const ms = value < 1e11 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value.trim());
    return Number.isNaN(d.getTime()) ? "" : d.toISOString();
  }
  return "";
}

function resolveAttribution(raw: IntakeInput["attribution"], flat: Record<string, unknown>): LeadAttribution {
  const pick = (key: keyof LeadAttribution, ...flatKeys: string[]): string => {
    const nested = raw?.[key as keyof typeof raw];
    if (typeof nested === "string" && nested.trim()) return nested.trim();
    for (const fk of flatKeys) {
      const v = flat[fk];
      if (typeof v === "string" && v.trim()) return v.trim().slice(0, FIELD_LIMITS.url);
    }
    return "";
  };
  return {
    pageUrl: pick("pageUrl", "pageUrl", "page_url"),
    landingPage: pick("landingPage", "landingPage", "landing_page"),
    utmSource: pick("utmSource", "utmSource", "utm_source"),
    utmMedium: pick("utmMedium", "utmMedium", "utm_medium"),
    utmCampaign: pick("utmCampaign", "utmCampaign", "utm_campaign"),
    utmContent: pick("utmContent", "utmContent", "utm_content"),
    utmTerm: pick("utmTerm", "utmTerm", "utm_term"),
    gclid: pick("gclid", "gclid", "gclId", "googleClickId"),
    referrer: pick("referrer", "referrer", "referer"),
  };
}

/**
 * Validate and normalize. Field-level failures are collected rather than
 * short-circuited so an integrator fixing their form sees everything wrong at
 * once instead of one round-trip per field.
 */
export function validateIntake(input: unknown): ValidationResult {
  const parsed = intakeSchema.safeParse(input);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((issue) => ({
      field: issue.path.join(".") || "_root",
      code: issue.code === "too_big" ? "too_long" : "invalid",
    }));
    return { ok: false, errors };
  }

  const data = parsed.data;
  const flat = (input ?? {}) as Record<string, unknown>;
  const errors: FieldError[] = [];

  const fullName = (data.fullName || [data.firstName, data.lastName].filter(Boolean).join(" ")).trim();
  const email = normalizeEmail(data.email ?? "");
  const phone = (data.phone ?? "").trim();

  if (!fullName) errors.push({ field: "fullName", code: "required" });
  if (email && !isValidEmail(email)) errors.push({ field: "email", code: "invalid_email" });
  // A lead with neither is unreachable. Storing it would put a card in the
  // pipeline nobody can action, which is worse than telling the caller now.
  if (!email && !phone) errors.push({ field: "contact", code: "email_or_phone_required" });

  const vehicleYear = (data.vehicleYear ?? "").trim();
  if (vehicleYear) {
    const currentYear = new Date().getUTCFullYear();
    if (!YEAR_PATTERN.test(vehicleYear) || Number(vehicleYear) < 1900 || Number(vehicleYear) > currentYear + 2) {
      errors.push({ field: "vehicleYear", code: "invalid_year" });
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  const value: LeadSubmission = {
    fullName,
    email,
    phone,
    vehicleYear,
    vehicleMake: data.vehicleMake ?? "",
    vehicleModel: data.vehicleModel ?? "",
    wrapStyle: (data.wrapStyle || data.wrapColor || "").trim(),
    requestedService: data.requestedService ?? "",
    estimatedBudget: parseBudget(data.estimatedBudget),
    estimatedBudgetRaw: typeof data.estimatedBudget === "string" ? data.estimatedBudget.trim() : data.estimatedBudget != null ? String(data.estimatedBudget) : "",
    desiredTimeline: data.desiredTimeline ?? "",
    message: data.message ?? "",
    preferredContactMethod: resolvePreferredContactMethod(data.preferredContactMethod),
    marketingConsent: data.marketingConsent === true,
    smsConsent: data.smsConsent === true,
    attribution: { ...EMPTY_ATTRIBUTION, ...resolveAttribution(data.attribution, flat) },
    submittedAt: parseSubmittedAt(data.submittedAt),
    sourceSystem: data.sourceSystem ?? "",
    externalDocId: data.externalDocId ?? "",
  };

  return { ok: true, value };
}
