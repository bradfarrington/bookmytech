import { mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { releaseStrandedHold } from "@/lib/stripe/release-hold";

// POST /api/mobile/v1/checkout/cancel — release a hold the customer gave up on.
// AUTHENTICATED.
//
// Body: { paymentIntentId }
// 200:  { ok: true, released } | { ok: false, error }
//       `released` is false when there was nothing left to cancel (already
//       released) — still a success, and what makes a retry safe. Only
//       transport-level problems return `{ error }` with a non-2xx: 401,
//       400/415 (bad body), 429.
//
// THE CASE THIS IS FOR. /checkout/prepare opens the hold, the app confirms it on
// device, and POST /bookings writes the row. If that last step fails and the
// customer gives up rather than retrying, their money is authorised against
// nothing. The app already handles the retry — it re-posts against the SAME hold
// rather than presenting the sheet again, so it never authorises twice — but it
// had no way to hand the money back. This is that way.
//
// Everything that decides whether the cancel is allowed happens in
// `releaseStrandedHold`, and it takes NOTHING from the caller but the id: the
// intent's owner, status and amount are re-read from Stripe, and the booking
// check comes from our own table. In particular the hold must carry the calling
// customer's `metadata.customer_id`, or anyone holding someone else's intent id
// could release their authorisation.
//
// Call it when the customer abandons a failed booking, not on every error — a
// retry that succeeds wants the hold intact, and cancelling first would make the
// customer authorise all over again.

interface CancelBody {
  paymentIntentId?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<CancelBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileActionCaller(request, "action");
  if (!auth.ok) return auth.response;

  const paymentIntentId =
    typeof parsed.body.paymentIntentId === "string" ? parsed.body.paymentIntentId.trim() : "";
  if (!paymentIntentId) return apiError("We couldn't find that payment.", 400);

  return apiOk(await releaseStrandedHold(paymentIntentId, auth.caller.userId));
}
