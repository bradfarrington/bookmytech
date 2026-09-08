import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  normalisePromoCode,
  validatePromoCode,
  PROMO_CODE_RE,
  type PromoCodeRow,
} from "./validate";

// The server half of a discount code (Task 35): look it up, count what has
// been taken, validate, and reserve or redeem it. Everything reads and writes
// through the service-role client — `promo_codes` is admin-only under RLS, so
// a customer never touches the table, they only ever get a sentence back.
//
// Reserve → redeem is the two-step the checkout needs: the hold is opened at
// `prepare` and the booking is written seconds (or a 3-D Secure detour) later,
// and in between the last redemption of a code must not be handed to somebody
// else. A reservation is keyed on the PaymentIntent and lapses after an hour.

export interface ResolvedPromo {
  code: PromoCodeRow;
  discountPence: number;
}

export type PromoResolution = { ok: true; promo: ResolvedPromo | null } | { ok: false; error: string };

const PROMO_COLUMNS =
  "id, code, kind, value, description, starts_at, expires_at, max_redemptions, per_customer_limit, min_total_pence, is_active";

/** What a typed code is worth on this basket, or the sentence to show. `null` promo = none was typed. */
export async function resolvePromoCode(
  db: SupabaseClient,
  rawCode: string | null | undefined,
  ctx: { customerId: string | null; totalPence: number },
): Promise<PromoResolution> {
  const code = normalisePromoCode(rawCode);
  if (!code) return { ok: true, promo: null };
  if (!PROMO_CODE_RE.test(code)) return { ok: false, error: "That code isn't valid." };
  if (!ctx.customerId) return { ok: false, error: "Sign in to use a discount code." };

  const { data: row } = await db.from("promo_codes").select(PROMO_COLUMNS).eq("code", code).maybeSingle();
  const promoRow = (row as PromoCodeRow | null) ?? null;
  if (!promoRow) return { ok: false, error: "That code isn't valid." };

  // Live = redeemed, or reserved and not yet lapsed. Counted here for the
  // customer-facing answer; redeem_promo_code counts again under a row lock,
  // which is what actually enforces the caps.
  const nowIso = new Date().toISOString();
  const { data: taken } = await db
    .from("promo_redemptions")
    .select("customer_id, status, expires_at")
    .eq("code_id", promoRow.id);
  const live = (taken ?? []).filter(
    (r) => r.status === "redeemed" || (r.status === "reserved" && (r.expires_at ?? "") > nowIso),
  );

  const verdict = validatePromoCode(promoRow, {
    now: new Date(),
    customerId: ctx.customerId,
    totalPence: ctx.totalPence,
    liveRedemptions: live.length,
    customerRedemptions: live.filter((r) => r.customer_id === ctx.customerId).length,
  });
  if (!verdict.ok) return verdict;
  return { ok: true, promo: { code: promoRow, discountPence: verdict.discountPence } };
}

/** Map the SQL function's raised codes to the customer's sentence. */
function redeemError(message: string): string {
  if (message.includes("promo_used_up")) return "That code has been used up.";
  if (message.includes("promo_already_used")) return "You've already used that code.";
  if (message.includes("promo_expired")) return "That code has expired.";
  if (message.includes("promo_not_started")) return "That code isn't active yet.";
  if (message.includes("promo_inactive") || message.includes("promo_not_found")) return "That code isn't valid.";
  return "That discount code is no longer available. Please go back and try again without it.";
}

/** Hold a redemption against a PaymentIntent while the customer pays. */
export async function reservePromo(
  db: SupabaseClient,
  promo: ResolvedPromo,
  customerId: string,
  paymentIntentId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await db.rpc("redeem_promo_code", {
    p_code_id: promo.code.id,
    p_customer_id: customerId,
    p_discount_pence: promo.discountPence,
    p_payment_intent_id: paymentIntentId,
    p_booking_id: null,
  });
  if (error) return { ok: false, error: redeemError(error.message) };
  return { ok: true };
}

/**
 * Take a claim on the code BEFORE the booking row is written, so a code that
 * has run out refuses while nothing has been written and the hold is still
 * the customer's. Returns the redemption row to attach afterwards.
 *
 * Usually the reservation from `prepare` is still standing and this is just
 * finding it. It claims a fresh one when there is none — a 'free' booking
 * (no PaymentIntent to have reserved against) or a reservation that lapsed
 * during a long 3-D Secure detour — and then the caps are re-checked, which
 * is the case that can answer no.
 */
export async function claimPromoForBooking(
  db: SupabaseClient,
  promo: ResolvedPromo,
  customerId: string,
  paymentIntentId: string | null,
): Promise<{ ok: true; redemptionId: string; discountPence: number } | { ok: false; error: string }> {
  if (paymentIntentId) {
    const { data: standing } = await db
      .from("promo_redemptions")
      .select("id, discount_pence")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .eq("code_id", promo.code.id)
      .eq("customer_id", customerId)
      .eq("status", "reserved")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (standing) return { ok: true, redemptionId: standing.id, discountPence: standing.discount_pence };
  }
  const { data, error } = await db.rpc("redeem_promo_code", {
    p_code_id: promo.code.id,
    p_customer_id: customerId,
    p_discount_pence: promo.discountPence,
    p_payment_intent_id: null,
    p_booking_id: null,
  });
  if (error || !data) return { ok: false, error: error ? redeemError(error.message) : "That code isn't valid." };
  return { ok: true, redemptionId: data as string, discountPence: promo.discountPence };
}

/** Tie a claimed redemption to the booking that used it. */
export async function attachPromoRedemption(
  db: SupabaseClient,
  redemptionId: string,
  bookingId: string,
): Promise<void> {
  const { error } = await db
    .from("promo_redemptions")
    .update({ status: "redeemed", booking_id: bookingId, expires_at: null })
    .eq("id", redemptionId);
  if (error) console.error("[promo] failed to attach redemption", redemptionId, error.message);
}

/** Give a reservation back when the customer abandoned the hold. */
export async function releasePromoForIntent(db: SupabaseClient, paymentIntentId: string): Promise<void> {
  await db
    .from("promo_redemptions")
    .update({ status: "released" })
    .eq("stripe_payment_intent_id", paymentIntentId)
    .eq("status", "reserved");
}
