import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";
import { CREDIT_EXPIRY_DAYS, TRUSTED_THRESHOLD } from "./constants";

type Admin = ReturnType<typeof createAdminClient>;

type GrantSource = "referral_welcome" | "referral_bonus" | "compensation" | "promo";

/**
 * The customer's spendable credit balance in pence — the sum of every ledger row
 * that hasn't expired (grants positive, redemptions negative). Clamped at 0 so a
 * partially-redeemed-then-expired grant can't show a negative balance.
 */
export async function availableCreditPence(admin: Admin, customerId: string): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data } = await admin
    .from("customer_credits")
    .select("amount_pence, expires_at")
    .eq("customer_id", customerId);
  const total = (data ?? [])
    .filter((r) => !r.expires_at || r.expires_at > nowIso)
    .reduce((sum, r) => sum + (r.amount_pence ?? 0), 0);
  return Math.max(0, total);
}

/**
 * Apply available credit to a booking. Inserts a single negative redemption row
 * for the applied amount (tagged to the booking) and returns the pence applied.
 * `cap` lets the caller clamp to the amount the charge was already reduced by at
 * PaymentIntent time, so the ledger never diverges from what Stripe charged.
 */
export async function redeemCreditForBooking(
  admin: Admin,
  customerId: string,
  bookingId: string,
  cap: number,
): Promise<number> {
  if (cap <= 0) return 0;
  const available = await availableCreditPence(admin, customerId);
  const applied = Math.min(available, cap);
  if (applied <= 0) return 0;

  const { error } = await admin.from("customer_credits").insert({
    customer_id: customerId,
    amount_pence: -applied,
    source: "redemption",
    description: "Applied at checkout",
    redeemed_at: new Date().toISOString(),
    redeemed_booking_id: bookingId,
  });
  if (error) {
    console.error("Failed to redeem credit for booking", bookingId, error.message);
    return 0;
  }
  return applied;
}

/** Insert a positive credit grant. `expires` defaults to CREDIT_EXPIRY_DAYS out. */
export async function grantCredit(
  admin: Admin,
  customerId: string,
  amountPence: number,
  source: GrantSource,
  description: string,
  expires: boolean = true,
): Promise<void> {
  if (amountPence <= 0) return;
  const expires_at = expires
    ? new Date(Date.now() + CREDIT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const { error } = await admin.from("customer_credits").insert({
    customer_id: customerId,
    amount_pence: amountPence,
    source,
    description,
    expires_at,
  });
  if (error) console.error("Failed to grant credit to", customerId, error.message);
}

/** True if a grant of this source already exists for the customer (dedup guard). */
export async function hasGrant(admin: Admin, customerId: string, source: GrantSource): Promise<boolean> {
  const { count } = await admin
    .from("customer_credits")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId)
    .eq("source", source);
  return (count ?? 0) > 0;
}

/** Count this customer's completed bookings. */
export async function completedBookingCount(admin: Admin, customerId: string): Promise<number> {
  const { count } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("customer_id", customerId)
    .eq("status", "completed");
  return count ?? 0;
}

/** Trusted Customer = TRUSTED_THRESHOLD+ completed bookings (skip pre-auth). */
export function isTrusted(completedCount: number): boolean {
  return completedCount >= TRUSTED_THRESHOLD;
}
