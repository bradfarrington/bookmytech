import "server-only";

// Refund a captured charge (full or partial) by PaymentIntent id. Used by
// dispute arbitration. Returns the refund id on success. If Stripe isn't
// configured (local dev) we report ok with no id so the resolution flow still
// completes — mirroring the graceful degradation in the capture/transfer paths.

/**
 * Refund across several captured intents (Task 33): a job paid with a base
 * hold plus approved-quote holds is refunded base-first, each intent up to
 * what it captured. Stops at the first failure and reports what went through.
 */
export async function refundAcrossIntents(
  intents: ReadonlyArray<{ paymentIntentId: string; capturedPence: number; alreadyRefundedPence?: number }>,
  amountPence: number,
): Promise<{ ok: true; refunds: Array<{ paymentIntentId: string; amountPence: number; refundId: string | null }> } | { ok: false; error: string; refunds: Array<{ paymentIntentId: string; amountPence: number; refundId: string | null }> }> {
  let remaining = Math.max(0, Math.round(amountPence));
  const refunds: Array<{ paymentIntentId: string; amountPence: number; refundId: string | null }> = [];
  for (const intent of intents) {
    if (remaining <= 0) break;
    const room = Math.max(0, intent.capturedPence - (intent.alreadyRefundedPence ?? 0));
    const slice = Math.min(room, remaining);
    if (slice <= 0) continue;
    const r = await refundPayment(intent.paymentIntentId, slice);
    if (!r.ok) return { ok: false, error: r.error, refunds };
    refunds.push({ paymentIntentId: intent.paymentIntentId, amountPence: slice, refundId: r.refundId });
    remaining -= slice;
  }
  if (remaining > 0) return { ok: false, error: "There isn't enough captured payment left to refund that amount.", refunds };
  return { ok: true, refunds };
}

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
