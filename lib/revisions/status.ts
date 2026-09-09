// Revision lifecycle rules (Task 37). Pure — unit-tested — shared by the
// mechanic's panel, the customer's approval page, the cron and the mobile
// routes. Mirrors lib/quotes/status.ts.

export type RevisionStatus = "sent" | "approved" | "declined" | "withdrawn" | "expired";

/** A job can only be revised once the mechanic is with the car. */
export const REVISABLE_STATUSES: readonly string[] = ["in_progress"];

/** The customer is usually standing there; a day is generous. */
export const REVISION_EXPIRY_HOURS = 24;

export function revisionExpiry(sentAt: Date = new Date()): Date {
  return new Date(sentAt.getTime() + REVISION_EXPIRY_HOURS * 60 * 60 * 1000);
}

/** A row (`expires_at`) or a view (`expiresAt`) — both shapes flow through here. */
export interface ExpirableRevision {
  status: string;
  expires_at?: string | null;
  expiresAt?: string | null;
}

export function isRevisionExpired(revision: ExpirableRevision, now: Date = new Date()): boolean {
  if (revision.status !== "sent") return false;
  const expires = revision.expires_at ?? revision.expiresAt ?? null;
  if (!expires) return false;
  return new Date(expires).getTime() <= now.getTime();
}

/** May the customer still answer this revision? Null when yes, else the sentence to show. */
export function revisionRefusal(
  revision: ExpirableRevision,
  bookingStatus: string,
  now: Date = new Date(),
): string | null {
  if (revision.status === "approved") return null; // idempotent approve handled by the caller
  if (revision.status !== "sent") return "This revised job is no longer open.";
  if (isRevisionExpired(revision, now)) return "This revised job has expired — ask your mechanic to send it again.";
  if (!REVISABLE_STATUSES.includes(bookingStatus))
    return "This job is no longer in progress, so the revised job can't be approved.";
  return null;
}

export const REVISION_STATUS_LABEL: Record<string, string> = {
  sent: "Waiting for the customer",
  approved: "Approved",
  declined: "Declined",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

/** How the mechanic may end the job after the customer declines the revision. */
export type OnSiteCharge = "diagnostic" | "cancellation" | "none";
