// Dispute domain constants — plain module (no I/O), importable by client + server.

export type DisputeStatus = "opened" | "responded" | "escalated" | "resolved" | "withdrawn";
export type DisputeRole = "customer" | "mechanic" | "admin";

// Reason categories the opener picks from, by who's opening.
export const CUSTOMER_REASONS = [
  { value: "workmanship", label: "Workmanship" },
  { value: "parts_cost", label: "Parts cost" },
  { value: "price", label: "Price" },
  { value: "conduct", label: "Mechanic conduct" },
  { value: "damage", label: "Damage" },
  { value: "other", label: "Other" },
] as const;

export const MECHANIC_REASONS = [
  { value: "refused_signoff", label: "Customer refuses to sign off" },
  { value: "abusive", label: "Customer abusive" },
  { value: "scope", label: "Disputed scope of work" },
  { value: "other", label: "Other" },
] as const;

export const REASON_LABELS: Record<string, string> = Object.fromEntries(
  [...CUSTOMER_REASONS, ...MECHANIC_REASONS].map((r) => [r.value, r.label]),
);

export function reasonsFor(role: "customer" | "mechanic") {
  return role === "customer" ? CUSTOMER_REASONS : MECHANIC_REASONS;
}

export function isValidReason(role: "customer" | "mechanic", value: string): boolean {
  return reasonsFor(role).some((r) => r.value === value);
}

// Customer's refund ask at open time.
export type RefundRequestKind = "full" | "partial" | "none";

export const DISPUTE_STATUS_LABELS: Record<DisputeStatus, string> = {
  opened: "Opened",
  responded: "Responded",
  escalated: "Escalated to BMT",
  resolved: "Resolved",
  withdrawn: "Withdrawn",
};

// Tailwind pill tones per status (matches the app's amber/green/grey palette).
export const DISPUTE_STATUS_TONES: Record<DisputeStatus, string> = {
  opened: "bg-amber-50 text-amber-800",
  responded: "bg-blue-50 text-brand-blue",
  escalated: "bg-red-50 text-red-600",
  resolved: "bg-green-50 text-success",
  withdrawn: "bg-surface text-text-muted",
};

export type ResolutionKind =
  | "full_refund"
  | "partial_refund"
  | "no_refund"
  | "credit"
  | "in_mechanic_favour"
  | "withdrawn";

export const RESOLUTION_LABELS: Record<ResolutionKind, string> = {
  full_refund: "Full refund",
  partial_refund: "Partial refund",
  no_refund: "No refund",
  credit: "Compensation credit",
  in_mechanic_favour: "Found in mechanic's favour",
  withdrawn: "Withdrawn by opener",
};

export const MIN_DESCRIPTION_CHARS = 30;
export const MAX_DISPUTE_PHOTOS = 6;

// Hours after the other party responds before the dispute auto-escalates to admin.
export const ESCALATION_HOURS = 48;
