import { enforceBookingLimits } from "@/lib/mobile/booking-guards";
import { requireMobileMechanic } from "@/lib/mobile/mechanic-guards";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { mobileStripeReturnUrl, validAppReturnUrl } from "@/lib/mechanics/mobile-return";
import { startStripeOnboardingFor } from "@/lib/mechanics/stripe-onboarding";

// POST /api/mobile/v1/mechanic/stripe/onboarding — start (or continue) payouts
// setup. AUTHENTICATED, mechanics only. The mobile twin of the website's
// `startStripeOnboarding()`; both run lib/mechanics/stripe-onboarding.ts.
//
// Body: { returnUrl } — where in the APP to land afterwards. Must be one of the
//       app's own schemes (lib/mechanics/mobile-return.ts); anything else is a
//       400, so this can't be used to mint a Stripe link that ends on someone
//       else's site.
// 200:  { url } — a single-use Stripe-hosted onboarding link. The app opens it
//       with `WebBrowser.openAuthSessionAsync(url, returnUrl)`.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.
//
// Creates the Express account on the first call. Stripe is given our bounce
// page for BOTH return and refresh: when a link expires the mechanic lands back
// in the app, which simply asks for a new one.

interface OnboardingBody {
  returnUrl?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<OnboardingBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await requireMobileMechanic(request);
  if (!auth.ok) return auth.response;

  const limited = await enforceBookingLimits(request, auth.caller, "mechanic");
  if (limited) return limited;

  const returnUrl = validAppReturnUrl(parsed.body.returnUrl);
  if (!returnUrl) {
    return apiError("Something went wrong. Please update the app and try again.", 400);
  }

  const bounce = mobileStripeReturnUrl(returnUrl);
  const result = await startStripeOnboardingFor(
    { userId: auth.caller.userId, email: auth.caller.email },
    { returnUrl: bounce, refreshUrl: bounce },
  );
  if (!result.ok) {
    // The core's message can be Stripe's own — fine on the website's console,
    // not for a mechanic's screen.
    console.error("[mechanic/stripe/onboarding] failed", result.error);
    return apiError("We couldn't start your payouts setup. Please try again in a moment.", 500);
  }

  return apiOk({ url: result.url });
}
