import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { trackEvent } from "@/app/actions/track-event";

// Release a pre-authorisation the customer gave up on.
//
// THE CASE THIS EXISTS FOR. Checkout takes the hold FIRST and writes the booking
// row SECOND, deliberately, so a payment failure can never leave a job with no
// money behind it. The mirror case is the one nothing handled: the hold
// succeeds, the booking write fails, and the customer walks away. Their money
// then sits on their card until Stripe expires the intent seven days later,
// while they think nothing happened.
//
// `app/actions/orphaned-hold.ts` covers the half of this we can do without the
// customer: it tells ops. This is the half only they can trigger — actually
// giving the money back. Same reasoning underneath, and the same two gates,
// because this one CANCELS rather than emails and so has to be stricter:
//
//   1. THE TRUTH IS RE-READ FROM STRIPE, never taken from the caller. The intent
//      id arrives in a request body. What it is, what it holds, and above all
//      WHOSE it is are read back from Stripe.
//
//   2. OWNERSHIP IS PROVED, not assumed. `prepareCheckoutFor` stamps
//      `metadata.customer_id` on every hold it opens for a signed-in customer.
//      No match, no cancel — otherwise anyone who came by an intent id could
//      release a stranger's authorisation, which is a denial-of-booking wearing
//      a helpful face.
//
// And one gate the reporter doesn't need: a hold with a BOOKING against it is
// not stranded, it's the money for a real job. Cancelling it would leave a
// confirmed booking with nothing to capture on completion.
//
// IDEMPOTENT by construction. An already-cancelled intent returns ok without
// calling Stripe again, so the app can retry a failed release, and a customer
// tapping twice gets one outcome rather than an error.

export type ReleaseHoldResult = { ok: true; released: boolean } | { ok: false; error: string };

/** Stripe PaymentIntent ids. Cheap sanity check before spending an API call. */
const INTENT_ID_RE = /^pi_[A-Za-z0-9_]{4,}$/;

/**
 * Cancel an uncaptured hold that belongs to `callerId` and has no booking
 * against it.
 *
 * `released` distinguishes "we cancelled it just now" from "there was nothing
 * left to cancel" — both are success, and the app can say "your payment has been
 * released" either way, but the difference matters in the logs.
 */
export async function releaseStrandedHold(
  paymentIntentId: string,
  callerId: string,
): Promise<ReleaseHoldResult> {
  if (!INTENT_ID_RE.test(paymentIntentId)) {
    return { ok: false, error: "We couldn't find that payment." };
  }

  let stripe;
  try {
    stripe = (await import("@/lib/stripe/server")).stripe;
  } catch {
    return { ok: false, error: "We can't reach our payment provider right now. Please try again shortly." };
  }

  let intent;
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch {
    // A made-up or foreign id lands here. Deliberately the same message as a
    // hold that isn't the caller's: telling them apart would let someone probe
    // which intent ids exist on our account.
    return { ok: false, error: "We couldn't find that payment." };
  }

  // Gate 2 — is it theirs? Holds opened for a guest carry no customer_id, and
  // this endpoint is authenticated-only, so an absent stamp is a refusal rather
  // than a pass. It also means holds opened before this metadata existed can
  // only be released by ops or by Stripe's own 7-day expiry, which is the safe
  // direction to fail.
  if (intent.metadata?.customer_id !== callerId) {
    return { ok: false, error: "We couldn't find that payment." };
  }

  // Already cancelled — nothing to do, and saying so plainly is what makes a
  // retry safe.
  if (intent.status === "canceled") return { ok: true, released: false };

  // Captured. There is no releasing this from here, and a captured intent means
  // money genuinely moved, so send them to a human rather than guessing.
  if (intent.status === "succeeded") {
    return {
      ok: false,
      error:
        "This payment has already been taken, so we can't release it here. " +
        "Please contact us and we'll sort it out.",
    };
  }

  // Gate 3 — a hold with a booking behind it isn't stranded. Cancelling it would
  // leave a confirmed job with nothing to capture when the mechanic finishes.
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (booking) {
    return {
      ok: false,
      error: "This payment is for a booking you've already made. Cancel the booking instead.",
    };
  }

  try {
    await stripe.paymentIntents.cancel(paymentIntentId, { cancellation_reason: "abandoned" });
  } catch (err) {
    // The realistic loser here is a race with a retry that wrote the booking and
    // captured between our check and this call. Report it rather than swallow
    // it: the customer needs to know the money is still held.
    const message = err instanceof Error ? err.message : "Payment error";
    return {
      ok: false,
      error: `We couldn't release your payment: ${message}. Please contact us and we'll sort it out.`,
    };
  }

  // Ops visibility. Best-effort and non-fatal — the money is already back, and a
  // tracking failure must not turn that into an error the customer sees.
  trackEvent("released_hold", {
    paymentIntentId,
    amountPence: intent.amount,
    statusBefore: intent.status,
  }).catch(() => {});

  return { ok: true, released: true };
}
