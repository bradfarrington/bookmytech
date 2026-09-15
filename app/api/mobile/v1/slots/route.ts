import { slotAvailabilityFor } from "@/lib/availability/slot-availability";
import { apiError, apiOk, apiRateLimited, clientIp } from "@/lib/mobile/respond";
import {
  DAY_SECONDS,
  MINUTE_SECONDS,
  type RateLimitRule,
  enforceRateLimits,
} from "@/lib/rate-limit/limiter";
import { optionalMobileUser } from "@/lib/supabase/mobile";

// GET /api/mobile/v1/slots?day=YYYY-MM-DD&postcode=NG12%207GG — how many
// mechanics are free in each arrival window that day. GUEST-ACCESSIBLE, like
// the rest of the booking flow; `postcode` is optional.
//
// 200: { day, areaChecked, windows: [{ window, startHour, mechanics, bookable }] }
//      window:      "8am–10am" … "6pm–8pm", then "All day (8am–8pm)" (startHour
//                   null).
//                   The same labels as the booking's slot_window.
//      mechanics:   approved, unsuspended mechanics whose saved hours cover the
//                   window and who have no other timed job in it. With a
//                   postcode, only those covering it (dispatch's radius rule);
//                   without one, across every mechanic, and areaChecked is false.
//      bookable:    the window is still far enough ahead to book.
// 400: a missing or out-of-range day. 429, 503.
//
// A count to show, not a reservation: dispatch still offers the booking to
// every mechanic in range who is online when it's made.
//
// Thin wrapper over lib/availability/slot-availability.ts, which the website's
// Time step also uses.

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const day = url.searchParams.get("day")?.trim() ?? "";
  const postcode = url.searchParams.get("postcode")?.trim() || null;

  if (!day) return apiError("Choose a day to see who's free.", 400);
  if (postcode && postcode.length > 10) return apiError("Enter a valid postcode.", 400);

  // A signed-in caller gets their own buckets; everyone counts against their address.
  const caller = await optionalMobileUser(request);
  const ip = clientIp(request);
  const rules: RateLimitRule[] = [];
  if (caller) {
    rules.push(
      { key: "mobile_slots_user_burst", subject: `user:${caller.userId}`, windowSeconds: MINUTE_SECONDS },
      { key: "mobile_slots_user_daily", subject: `user:${caller.userId}`, windowSeconds: DAY_SECONDS },
    );
  }
  rules.push(
    { key: "mobile_slots_ip_burst", subject: `ip:${ip}`, windowSeconds: MINUTE_SECONDS },
    { key: "mobile_slots_ip_daily", subject: `ip:${ip}`, windowSeconds: DAY_SECONDS },
  );
  const verdict = await enforceRateLimits(rules);
  if (!verdict.allowed) {
    return apiRateLimited(
      "You've checked availability a lot just now. Please wait a moment and try again.",
      verdict.retryAfterSeconds,
    );
  }

  const result = await slotAvailabilityFor(day, postcode);
  if (!result.ok) return apiError(result.error, result.invalid ? 400 : 503);
  return apiOk({ day: result.day, areaChecked: result.areaChecked, windows: result.windows });
}
