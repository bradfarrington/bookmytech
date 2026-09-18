import { mobileMechanicCaller } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { mechanicEarningsFor } from "@/lib/mechanics/earnings-summary";

// GET /api/mobile/v1/mechanic/earnings — what the Earnings screen cannot work
// out for itself. AUTHENTICATED, mechanics only.
//
// 200:  MechanicEarnings — see lib/mechanics/earnings-summary.ts:
//         balance         the ledger aggregate; `balancePence` goes negative
//                         while a refund Book My Tech fronted is being recovered
//         commissionRate  the rate their next job is charged at, as a fraction
//         account         the payout bank's name and last four, or null
//         payouts         every transfer we recorded in the ledger, newest
//                         first, up to 12 — including ones sent to an earlier
//                         Connect account — each read from Stripe by id
//         payoutsLive     false when Connect isn't set up now or Stripe is
//                         unconfigured, so the app says "Payouts start once
//                         you're set up" rather than "No payouts yet"
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.
//
// The app reads `mechanic_ledger` and its completed `bookings` under RLS and
// does the month-to-date, average and projection sums itself, exactly as the
// website's earnings page does. Only Stripe needs the server.
//
// There is no "next payout": mechanics are paid per job on completion (owner
// decision 2026-07-01), so the website's weekly-accrual preview is deliberately
// not ported.

export async function GET(request: Request): Promise<Response> {
  const auth = await mobileMechanicCaller(request, "mechanicfeed");
  if (!auth.ok) return auth.response;

  try {
    return apiOk(await mechanicEarningsFor(auth.caller.userId));
  } catch (err) {
    console.error("[mechanic/earnings] failed", auth.caller.userId, err);
    return apiError("We couldn't load your earnings. Please try again in a moment.", 500);
  }
}
