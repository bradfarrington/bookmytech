import { mobileMechanicCaller } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { daySummaryFor } from "@/lib/mechanics/day-summary";
import { isDayKey, londonDateKey } from "@/lib/slots";

// GET /api/mobile/v1/mechanic/summary?day=YYYY-MM-DD — one London day of the
// caller's work: a distance for each job, when to leave for the first one,
// their accept rate, and the day's totals. AUTHENTICATED, mechanics only.
//
// `day` defaults to today, UK time. It feeds the app's Today screen, and the
// Tomorrow and End-of-day screens its `tomorrow` / `recap` pushes open.
//
// 200:  DaySummary — see lib/mechanics/day-summary.ts for the shape.
// 400:  { error } — `day` isn't a real calendar date.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.
//
// The app reads the bookings themselves under RLS; this adds what it cannot
// work out, because only the server can turn postcodes into distances.

export async function GET(request: Request): Promise<Response> {
  const auth = await mobileMechanicCaller(request, "mechanicfeed");
  if (!auth.ok) return auth.response;

  const day = new URL(request.url).searchParams.get("day");
  if (day !== null && !isDayKey(day)) {
    return apiError("Something went wrong. Please update the app and try again.", 400);
  }

  try {
    return apiOk(await daySummaryFor(auth.caller.userId, day ?? londonDateKey(new Date())));
  } catch (err) {
    console.error("[mechanic/summary] failed", err);
    return apiError("We couldn't load your day. Please try again in a moment.", 500);
  }
}
