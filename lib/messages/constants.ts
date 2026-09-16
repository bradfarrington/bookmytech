// Pure constants for booking messages, in their own module so both the
// server-only sender (send.ts) and anything testable can import them.
// send.ts re-exports CLOSED_STATUSES, so existing imports keep working.

/**
 * Booking statuses whose message thread is closed.
 *
 * `sendMessageFor` refuses to post to one of these, so their threads are
 * read-only history: they belong on the job page, not in an inbox that implies
 * a reply is possible.
 */
export const CLOSED_STATUSES = ["completed", "cancelled"] as const;
