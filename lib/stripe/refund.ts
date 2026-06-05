import "server-only";

// Refund a captured charge (full or partial) by PaymentIntent id. Used by
// dispute arbitration. Returns the refund id on success. If Stripe isn't
// configured (local dev) we report ok with no id so the resolution flow still
// completes — mirroring the graceful degradation in the capture/transfer paths.
export async function refundPayment(
  paymentIntentId: string,
  amountPence: number,
): Promise<{ ok: true; refundId: string | null } | { ok: false; error: string }> {
  if (amountPence <= 0) return { ok: true, refundId: null };

  let stripe: typeof import("@/lib/stripe/server").stripe | null = null;
  try {
    stripe = (await import("@/lib/stripe/server")).stripe;
  } catch {
    return { ok: true, refundId: null };
  }

  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
      amount: amountPence,
      metadata: { reason: "dispute_resolution" },
    });
    return { ok: true, refundId: refund.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Refund failed" };
  }
}
