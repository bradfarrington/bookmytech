// What stops a customer deleting their account. Pure — no I/O — so the one
// rule that decides "not yet" can be read in a screen and tested exhaustively
// (blockers.test.ts). The app shows `error` to the customer VERBATIM and
// mirrors none of these lists, so widening or narrowing a set is ours alone.
//
// The three codes are typed in the app's lib/account.ts. Adding a fourth is
// safe (the app shows the sentence regardless) but tell Brad.

export type DeletionBlockerCode = "live_booking" | "open_dispute" | "pending_quote";

export interface DeletionBlocker {
  code: DeletionBlockerCode;
  error: string;
}

/**
 * Booking statuses that mean money is held or a mechanic is committed. A
 * `completed` booking still inside its 48-hour dispute window is deliberately
 * NOT here: deletion forfeits the right to dispute, and the app's copy says so.
 * `disputed` (legacy status, never written by current code) is left to the
 * dispute check, which is what it actually means.
 */
export const LIVE_BOOKING_STATUSES: ReadonlySet<string> = new Set([
  "sourcing_mechanic",
  "confirmed",
  "en_route",
  "in_progress",
]);

/** Dispute statuses that are still someone's problem. Matches customer_admin_summary. */
export const OPEN_DISPUTE_STATUSES: ReadonlySet<string> = new Set([
  "opened",
  "responded",
  "escalated",
]);

/**
 * The one quote status that is waiting on the customer. Approving a `now`
 * quote opens a second Stripe hold but leaves the row at `sent` until the card
 * is authorised (lib/quotes/customer.ts), so "approved whose hold is not yet
 * confirmed" is also `sent`. A `sent` quote past its expiry is dead — the cron
 * will mark it — and is not a blocker.
 */
export const PENDING_QUOTE_STATUS = "sent";

export interface BlockerBooking {
  status: string;
  disputes?: ReadonlyArray<{ status: string }> | null;
  job_quotes?: ReadonlyArray<{ status: string; expires_at: string | null }> | null;
}

const MESSAGES: Record<DeletionBlockerCode, string> = {
  live_booking:
    "You have a booking in progress. Cancel it or wait until it's finished, then try again.",
  open_dispute: "You have an open dispute. Once it's resolved you can delete your account.",
  pending_quote: "A quote on one of your jobs is still open. Approve or decline it first.",
};

/**
 * The first reason this account can't be deleted yet, or null when it can.
 * Checked in the order a customer can act on them: a live booking is the
 * loudest thing on their dashboard, then a dispute, then a quote.
 */
export function deletionBlocker(
  bookings: ReadonlyArray<BlockerBooking>,
  now: Date = new Date(),
): DeletionBlocker | null {
  if (bookings.some((b) => LIVE_BOOKING_STATUSES.has(b.status))) {
    return { code: "live_booking", error: MESSAGES.live_booking };
  }
  if (bookings.some((b) => (b.disputes ?? []).some((d) => OPEN_DISPUTE_STATUSES.has(d.status)))) {
    return { code: "open_dispute", error: MESSAGES.open_dispute };
  }
  const nowMs = now.getTime();
  const pendingQuote = bookings.some((b) =>
    (b.job_quotes ?? []).some(
      (q) =>
        q.status === PENDING_QUOTE_STATUS &&
        (!q.expires_at || new Date(q.expires_at).getTime() > nowMs),
    ),
  );
  if (pendingQuote) return { code: "pending_quote", error: MESSAGES.pending_quote };
  return null;
}

/**
 * The undeliverable address a deleted account's auth row takes. Nothing under
 * `invalid.bookmytech.co.uk` receives mail, so a password reset can't be
 * requested against it, and the real address is freed for a fresh sign-up.
 * Deterministic so a retried deletion writes the same value.
 */
export function deletedSentinelEmail(userId: string): string {
  return `deleted+${userId}@invalid.bookmytech.co.uk`;
}

/** Is this the sentinel? Lets admin pages show "deleted" instead of the address. */
export function isDeletedSentinelEmail(email: string | null | undefined): boolean {
  return !!email && /^deleted\+[0-9a-f-]+@invalid\.bookmytech\.co\.uk$/i.test(email);
}
