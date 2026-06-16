import Stripe from "stripe";

// Stripe test-mode client. The guide says "check Stripe → Uncaptured" by eye;
// in automation we assert the same fact against the API instead.
export function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set — is .env.local loaded?");
  if (!key.startsWith("sk_test_")) {
    throw new Error("Refusing to run e2e against a non-test Stripe key.");
  }
  return new Stripe(key);
}

/** Fetch a PaymentIntent created during the booking flow. */
export async function getPaymentIntent(id: string): Promise<Stripe.PaymentIntent> {
  return stripeClient().paymentIntents.retrieve(id);
}

/**
 * Confirm a manual-capture PaymentIntent with a test card, server-side.
 *
 * The booking funnel creates this intent in prepareCheckout; the UI would
 * confirm it via Stripe Elements, but Stripe's bot-detection (hCaptcha) makes
 * the in-browser confirmPayment unrunnable under automation. Confirming via the
 * API places the real authorisation hold instead — leaving the intent in
 * `requires_capture` (an uncaptured hold), exactly what guide §1.1 verifies.
 */
export async function confirmHold(id: string): Promise<Stripe.PaymentIntent> {
  return stripeClient().paymentIntents.confirm(id, {
    payment_method: "pm_card_visa", // Stripe's shared test Visa
    return_url: "http://localhost:3000/book",
  });
}
