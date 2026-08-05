// Who owns a booking. A plain predicate with no I/O, so the one rule that keeps
// a customer out of someone else's job can be read in ten lines and tested
// exhaustively — see ownership.test.ts.
//
// Every customer action that takes a booking id from a request routes through
// this: cancel, reschedule, answer a proposed move, review. The id itself proves
// nothing, because it arrives in the path; the CALLER is what the trusted layer
// resolved (a cookie session on the website, a verified Bearer token on mobile).

/** Who is asking. Resolved from a cookie session (web) or a Bearer token (mobile). */
export interface BookingCaller {
  userId: string;
  /** Needed for the guest-match arm — a guest booking has no customer_id. */
  email: string | null;
}

/** The two columns that decide ownership. */
export interface OwnableBooking {
  customer_id: string | null;
  customer_email: string | null;
}

/**
 * Mirrors the "Customers can view own bookings" RLS policy (0003) exactly, so a
 * customer can act on precisely the bookings they can see and no others:
 *
 *   auth.uid() = customer_id
 *   or (customer_id is null and auth.email() = customer_email)
 *
 * with one hardening the SQL doesn't need. In Postgres, `null = null` is null
 * and the policy fails closed. In TypeScript, `null === null` is TRUE — so a
 * caller whose token carries no email would match EVERY guest booking that also
 * has no email. Both sides are therefore required to be non-null here.
 *
 * The email comparison is case-SENSITIVE, matching `auth.email()`. Anything
 * looser would let an action reach a booking the caller cannot read, and an
 * action that outruns RLS is the wrong direction to diverge in.
 */
export function ownsBooking(booking: OwnableBooking, caller: BookingCaller): boolean {
  if (booking.customer_id) return booking.customer_id === caller.userId;
  return !!caller.email && !!booking.customer_email && booking.customer_email === caller.email;
}
