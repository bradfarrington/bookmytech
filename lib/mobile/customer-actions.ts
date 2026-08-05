import "server-only";

// The shared preamble for every authenticated "do something to a thing I own"
// mobile route: cancel, reschedule, review, dispute, release a hold.
//
// Each of those routes answers the same three questions before doing any work —
// who is calling, are they going too fast, and is the id in the path even an id
// — and then hands a caller to a shared core in lib/ that decides ownership.
// Collapsing the preamble here is what keeps that last step from being the one
// a route forgets: a handler that skips `mobileActionCaller` has no `caller` to
// pass to the core, so it can't compile into something that trusts the body.

import { apiError } from "@/lib/mobile/respond";
import { enforceBookingLimits, type MobileLimitFamily } from "@/lib/mobile/booking-guards";
import { requireMobileUser, type MobileCaller } from "@/lib/supabase/mobile";
import type { BookingCaller } from "@/lib/bookings/manage-booking";

export type MobileActionCaller =
  | {
      ok: true;
      caller: MobileCaller;
      /** The same caller in the shape the lib/ cores take. */
      bookingCaller: BookingCaller;
    }
  | { ok: false; response: Response };

/**
 * Resolve and rate-limit the caller of a customer-action route.
 *
 * Deliberately no `staffRefusal` here, unlike the booking endpoints. Staff
 * accounts are refused at BOOKING time because a booking written under a staff
 * id would be invisible to them; there is no equivalent harm in an admin
 * cancelling a booking they somehow own, and the ownership check in the core
 * already refuses the case that matters. Telling someone "staff accounts can't
 * do this" when the real answer is "this isn't your booking" would just be
 * wrong.
 */
export async function mobileActionCaller(
  request: Request,
  family: MobileLimitFamily,
): Promise<MobileActionCaller> {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return { ok: false, response: apiError(auth.error, auth.status) };

  const limited = await enforceBookingLimits(request, auth.caller, family);
  if (limited) return { ok: false, response: limited };

  return {
    ok: true,
    caller: auth.caller,
    bookingCaller: { userId: auth.caller.userId, email: auth.caller.email },
  };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Path ids are always UUIDs here. Rejecting a malformed one early keeps a
 * Postgres cast error out of the picture, and — more usefully — means every
 * "no such thing" answer downstream genuinely means "not yours or not there"
 * rather than "you sent gibberish".
 */
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
