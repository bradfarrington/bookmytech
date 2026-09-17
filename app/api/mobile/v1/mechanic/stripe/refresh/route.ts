import { enforceBookingLimits } from "@/lib/mobile/booking-guards";
import { requireMobileMechanic } from "@/lib/mobile/mechanic-guards";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { refreshStripeStatusFor } from "@/lib/mechanics/stripe-onboarding";

// POST /api/mobile/v1/mechanic/stripe/refresh — re-read the payout account from
// Stripe and store its flags. AUTHENTICATED, mechanics only. The mobile twin of
// the website's `refreshStripeStatus()`; both run
// lib/mechanics/stripe-onboarding.ts.
//
// No body.
// 200:  { payoutsEnabled }. A mechanic who has not started onboarding gets
//       `false`, not an error — the app calls this on every return to the
//       payouts screen and "not yet" is an answer.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.
//
// The webhook does the same job, but not always before the mechanic is back in
// the app. The first time payouts come through as enabled, the mechanic is put
// online and waiting bookings are re-offered — same as the website.
//
// No body means no `readJsonBody`, and so no content-type check. The CSRF
// reasoning behind that check doesn't reach here: the caller is identified by a
// bearer header, which a cross-origin page cannot attach without a preflight we
// never answer.

export async function POST(request: Request): Promise<Response> {
  const auth = await requireMobileMechanic(request);
  if (!auth.ok) return auth.response;

  const limited = await enforceBookingLimits(request, auth.caller, "mechanic");
  if (limited) return limited;

  const result = await refreshStripeStatusFor(auth.caller.userId);
  if (!result.ok) {
    console.error("[mechanic/stripe/refresh] failed", result.error);
    return apiError("We couldn't check your payouts status. Please try again in a moment.", 500);
  }

  return apiOk({ payoutsEnabled: result.payoutsEnabled });
}
