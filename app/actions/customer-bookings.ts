"use server";

import { createClient } from "@/lib/supabase/server";
import {
  cancelBookingFor,
  quoteCancellationFor,
  rescheduleBookingFor,
  respondToRescheduleFor,
  type BookingCaller,
} from "@/lib/bookings/manage-booking";

// The WEBSITE's entry points into the booking-management core. Every one is a
// thin wrapper whose only job is to answer "who is asking?" from the session
// COOKIE and hand that to lib/bookings/manage-booking.ts, which holds the logic
// and is shared with the mobile route handlers
// (app/api/mobile/v1/bookings/[id]/**).
//
// The caller is deliberately NOT a parameter of these functions. Every export of
// a "use server" file is a public endpoint the browser can call with arguments
// of its choosing, so `cancelBooking(id, reason, userId)` would let anyone
// cancel anyone else's booking by knowing its id. Mobile threads its caller
// through explicitly because it resolves that caller from a verified Bearer
// token in a route handler, where nothing is client-supplied either.
//
// `getUser()` rather than `getSession()`: it verifies the JWT with Supabase
// instead of trusting the cookie's claims, which is what you want before
// cancelling a job and capturing a fee off someone's card.

export type { CustomerBookingResult, CancellationQuote } from "@/lib/bookings/manage-booking";

async function cookieCaller(): Promise<BookingCaller | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { userId: user.id, email: user.email ?? null } : null;
}

/**
 * Customer responds to a mechanic-proposed reschedule.
 *
 * Passes a NULL caller, deliberately, keeping this path's trust model exactly as
 * it was: it is reached from the guest confirmation page (/book/confirmed/[id]),
 * where the customer may have no account at all and is identified by possession
 * of the booking's full UUID. Resolving a cookie caller and enforcing ownership
 * here would refuse a real case — someone who booked as a guest on one email and
 * later signed up on another, following their own confirmation link.
 *
 * The mobile route passes a verified caller instead, because it always has one
 * and a bare booking id must not be enough to answer someone else's reschedule.
 * The "must currently be 'proposed'" gate applies on both paths.
 */
export async function respondToReschedule(bookingId: string, decision: "accept" | "decline") {
  return respondToRescheduleFor(bookingId, decision, null);
}

// ---------------------------------------------------------------------------
// Cancel + reschedule from the dashboard. These are customer-initiated, so they
// require a signed-in customer who owns the booking (unlike the reschedule
// *response* above, which a guest can reach from their confirmation link).
// ---------------------------------------------------------------------------

/** Fee preview shown before the customer confirms a cancellation. */
export async function quoteCancellation(bookingId: string) {
  const caller = await cookieCaller();
  if (!caller) return { ok: false as const, error: "Please sign in." };
  return quoteCancellationFor(bookingId, caller);
}

/** Cancel a booking, settling the pre-authorisation against the fee tier. */
export async function cancelBooking(bookingId: string, reason: string) {
  const caller = await cookieCaller();
  if (!caller) return { ok: false as const, error: "Please sign in." };
  return cancelBookingFor(bookingId, reason, caller);
}

/** Move a booking to a new slot, keeping the same mechanic. */
export async function rescheduleBooking(bookingId: string, newIso: string, reason: string) {
  const caller = await cookieCaller();
  if (!caller) return { ok: false as const, error: "Please sign in." };
  return rescheduleBookingFor(bookingId, newIso, reason, caller);
}
