import { mobileMechanicCaller } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";

// POST /api/mobile/v1/mechanic/stripe/dashboard — a link into the mechanic's
// Stripe Express dashboard. AUTHENTICATED, mechanics only.
//
// No body.
// 200:  { url } — single-use and short-lived. The app opens it in the in-app
//       browser, the same as onboarding. It is where the bank account is
//       changed and every transfer is itemised; we deliberately do not rebuild
//       any of that.
// 409:  payouts aren't set up yet, with a sentence saying so.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.
//
// Nothing else in the repo mints one of these — the website's payouts page has
// no such button yet. When it grows one it calls Stripe through the same
// `createDashboardLink` (lib/stripe/connect.ts).
//
// No body means no `readJsonBody`, and so no content-type check — the same
// reasoning as ../refresh: the caller is identified by a bearer header, which a
// cross-origin page cannot attach without a preflight we never answer.

export async function POST(request: Request): Promise<Response> {
  const auth = await mobileMechanicCaller(request, "mechanic");
  if (!auth.ok) return auth.response;

  const accountId = auth.mechanic.stripe_account_id;
  if (!accountId) {
    return apiError("Set up your payouts first, then you can open your Stripe dashboard.", 409);
  }

  try {
    const { createDashboardLink } = await import("@/lib/stripe/connect");
    return apiOk({ url: await createDashboardLink(accountId) });
  } catch (err) {
    // Stripe refuses a login link on an account that hasn't finished
    // onboarding, so this is the likeliest failure and the sentence says the
    // useful thing rather than "something went wrong".
    console.error("[mechanic/stripe/dashboard] failed", auth.caller.userId, err);
    return apiError(
      "We couldn't open your Stripe dashboard. Finish setting up your payouts, then try again.",
      409,
    );
  }
}
