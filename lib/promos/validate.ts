// Discount codes (Task 35). Pure — unit-tested — so the one set of rules
// decides what a code is worth wherever it is asked: the website's "Apply"
// button, the checkout that opens the hold, the booking write that finalises
// it, and the mobile app's copy of all three.
//
// Every refusal is a sentence for the customer, not a code for a developer:
// the mobile app shows `error` verbatim.

export type PromoKind = "percent" | "fixed";

export interface PromoCodeRow {
  id: string;
  code: string;
  kind: PromoKind;
  /** percent: 1–100. fixed: pence. */
  value: number;
  description: string | null;
  starts_at: string;
  expires_at: string | null;
  max_redemptions: number | null;
  per_customer_limit: number;
  min_total_pence: number;
  is_active: boolean;
}

export interface PromoContext {
  now: Date;
  /** Null for a guest — codes need an account, like credit. */
  customerId: string | null;
  /** The booking total the discount comes off. */
  totalPence: number;
  /** Redemptions of this code that count (redeemed, or reserved and unexpired). */
  liveRedemptions: number;
  /** …of which are this customer's. */
  customerRedemptions: number;
}

export type PromoValidation =
  | { ok: true; discountPence: number }
  | { ok: false; error: string };

/** Uppercase, trimmed, inner spaces dropped — what the customer typed, as stored. */
export function normalisePromoCode(raw: string | null | undefined): string {
  return (raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export const PROMO_CODE_RE = /^[A-Z0-9-]{3,24}$/;

function pounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

/**
 * What this code is worth on this basket, or why it isn't.
 *
 * `code` is null when nothing matched what they typed — deliberately the same
 * sentence as an inactive code, so a stranger can't probe which codes exist.
 */
export function validatePromoCode(code: PromoCodeRow | null, ctx: PromoContext): PromoValidation {
  if (!code || !code.is_active) return { ok: false, error: "That code isn't valid." };
  if (!ctx.customerId) return { ok: false, error: "Sign in to use a discount code." };

  const now = ctx.now.getTime();
  if (new Date(code.starts_at).getTime() > now) return { ok: false, error: "That code isn't active yet." };
  if (code.expires_at && new Date(code.expires_at).getTime() <= now)
    return { ok: false, error: "That code has expired." };
  if (code.max_redemptions != null && ctx.liveRedemptions >= code.max_redemptions)
    return { ok: false, error: "That code has been used up." };
  if (ctx.customerRedemptions >= code.per_customer_limit)
    return { ok: false, error: "You've already used that code." };
  if (ctx.totalPence < code.min_total_pence)
    return {
      ok: false,
      error: `That code needs a booking of at least ${pounds(code.min_total_pence)}.`,
    };

  const discountPence =
    code.kind === "percent"
      ? Math.round((ctx.totalPence * code.value) / 100)
      : Math.min(code.value, ctx.totalPence);
  if (discountPence <= 0) return { ok: false, error: "That code isn't worth anything on this booking." };
  return { ok: true, discountPence: Math.min(discountPence, ctx.totalPence) };
}

/**
 * How a total is settled: the discount first, then account credit on what's
 * left, then the card. Discount before credit deliberately — credit is the
 * customer's own money and shouldn't be spent on a discounted amount they
 * were never going to pay.
 */
export function chargeAfterDiscounts(
  totalPence: number,
  rawDiscountPence: number,
  availableCreditPence: number,
): { discountPence: number; creditPence: number; chargePence: number } {
  const total = Math.max(0, Math.round(totalPence));
  const discountPence = Math.min(Math.max(0, Math.round(rawDiscountPence)), total);
  const creditPence = Math.min(Math.max(0, Math.round(availableCreditPence)), total - discountPence);
  return { discountPence, creditPence, chargePence: total - discountPence - creditPence };
}

/** A code's offer, for the admin table and the customer-facing email. */
export function promoOfferLabel(code: Pick<PromoCodeRow, "kind" | "value">): string {
  return code.kind === "percent" ? `${code.value}% off` : `${pounds(code.value)} off`;
}
