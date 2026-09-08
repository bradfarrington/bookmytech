// Quote lifecycle rules (Task 33). Pure — unit-tested — shared by the
// mechanic's builder, the customer's approval, the cron and the mobile routes.

export type QuoteKind = "now" | "follow_on" | "reduction";
export type QuoteStatus = "draft" | "sent" | "approved" | "declined" | "withdrawn" | "expired";

/** Booking statuses a quote of each kind may be raised from. */
export const QUOTABLE_STATUSES: Record<QuoteKind, readonly string[]> = {
  now: ["in_progress"],
  follow_on: ["in_progress", "completed"],
  reduction: ["in_progress"],
};

/** A sent quote lapses after this many days unanswered. */
export const QUOTE_EXPIRY_DAYS = 7;

export function quoteExpiry(sentAt: Date = new Date()): Date {
  return new Date(sentAt.getTime() + QUOTE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
}

/** A row (`expires_at`) or a view (`expiresAt`) — both shapes flow through here. */
export interface ExpirableQuote {
  status: string;
  expires_at?: string | null;
  expiresAt?: string | null;
}

export function isQuoteExpired(quote: ExpirableQuote, now: Date = new Date()): boolean {
  if (quote.status !== "sent") return false;
  const expires = quote.expires_at ?? quote.expiresAt ?? null;
  if (!expires) return false;
  return new Date(expires).getTime() <= now.getTime();
}

/** May the customer still answer this quote? Null when yes, else the sentence to show. */
export function respondRefusal(
  quote: ExpirableQuote & { kind: string },
  bookingStatus: string,
  now: Date = new Date(),
): string | null {
  if (quote.status === "approved") return null; // idempotent approve / no-op decline handled by the caller
  if (quote.status !== "sent") return "This quote is no longer open.";
  if (isQuoteExpired(quote, now)) return "This quote has expired — ask your mechanic to send it again.";
  if (quote.kind === "now" && bookingStatus !== "in_progress")
    return "This job is no longer in progress, so this quote can't be approved.";
  return null;
}

export const QUOTE_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  sent: "Waiting for the customer",
  approved: "Approved",
  declined: "Declined",
  withdrawn: "Withdrawn",
  expired: "Expired",
};

export const QUOTE_KIND_LABEL: Record<string, string> = {
  now: "Extra work on this visit",
  follow_on: "Return visit",
  reduction: "Price reduction",
};
