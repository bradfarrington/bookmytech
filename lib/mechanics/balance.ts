import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

// Mechanic balance ledger helpers. Single source of truth so completeAndCharge,
// the admin refund action, and the balance read-outs all agree.
//
// Sign convention (integer pence): balance = SUM(amount_pence) = what BMT owes
// the mechanic. Positive = BMT owes them (a not-yet-transferred earning, e.g. a
// failed transfer awaiting retry). Negative = the mechanic owes BMT (a refund
// BMT fronted that hasn't been recovered yet). In the instant-payout model the
// balance sits at ~0; it only goes negative between a refund and its recovery.
//
// See supabase/migrations/0034_mechanic_balance_ledger.sql. Every write goes
// through the service-role client — the table has no browser INSERT policy.

export interface BalanceSummary {
  /** Lifetime gross the mechanic has earned (sum of 'earning' rows). */
  totalEarnedPence: number;
  /** Lifetime cash actually transferred to them (sum of |'payout'| rows). */
  totalPaidOutPence: number;
  /** Lifetime value clawed back via refunds (sum of |'refund_clawback'| rows). */
  totalClawedBackPence: number;
  /** Current balance = SUM(amount_pence). Negative = owed to BMT. */
  balancePence: number;
}

/**
 * The mechanic's current balance in pence = the running sum of every ledger row.
 * Negative means they owe BMT (an un-recovered refund); it will be netted off
 * their next payout. Zero (the norm) means fully settled.
 */
export async function mechanicBalancePence(admin: Admin, mechanicId: string): Promise<number> {
  const { data } = await admin
    .from("mechanic_ledger")
    .select("amount_pence")
    .eq("mechanic_id", mechanicId);
  return (data ?? []).reduce((sum, r) => sum + (r.amount_pence ?? 0), 0);
}

/** Aggregate the ledger into the head-line figures the dashboards show. */
export async function mechanicBalanceSummary(
  admin: Admin,
  mechanicId: string,
): Promise<BalanceSummary> {
  const { data } = await admin
    .from("mechanic_ledger")
    .select("entry_type, amount_pence")
    .eq("mechanic_id", mechanicId);

  const rows = data ?? [];
  let totalEarnedPence = 0;
  let totalPaidOutPence = 0;
  let totalClawedBackPence = 0;
  let balancePence = 0;
  for (const r of rows) {
    const amt = r.amount_pence ?? 0;
    balancePence += amt;
    if (r.entry_type === "earning") totalEarnedPence += amt;
    else if (r.entry_type === "payout") totalPaidOutPence += -amt;
    else if (r.entry_type === "refund_clawback") totalClawedBackPence += -amt;
  }
  return { totalEarnedPence, totalPaidOutPence, totalClawedBackPence, balancePence };
}

/** Record the mechanic's gross share for a completed job (+, credit). */
export async function recordEarning(
  admin: Admin,
  mechanicId: string,
  bookingId: string,
  pence: number,
  description: string,
): Promise<void> {
  if (pence <= 0) return;
  const { error } = await admin.from("mechanic_ledger").insert({
    mechanic_id: mechanicId,
    booking_id: bookingId,
    entry_type: "earning",
    amount_pence: pence,
    description,
  });
  if (error) console.error("Failed to record earning for mechanic", mechanicId, error.message);
}

/** Record cash actually transferred to the mechanic (−, debit). */
export async function recordPayout(
  admin: Admin,
  mechanicId: string,
  bookingId: string,
  pence: number,
  stripeTransferId: string | null,
  description: string,
): Promise<void> {
  if (pence <= 0) return;
  const { error } = await admin.from("mechanic_ledger").insert({
    mechanic_id: mechanicId,
    booking_id: bookingId,
    entry_type: "payout",
    amount_pence: -pence,
    stripe_transfer_id: stripeTransferId,
    description,
  });
  if (error) console.error("Failed to record payout for mechanic", mechanicId, error.message);
}

/**
 * Record a refund clawback against the mechanic (−, debit). BMT has already
 * refunded the customer from its own Stripe balance; this debits the mechanic so
 * the value is recovered from their next payout(s). Their balance goes negative.
 */
export async function recordRefundClawback(
  admin: Admin,
  mechanicId: string,
  bookingId: string,
  pence: number,
  stripeRefundId: string | null,
  createdBy: string,
  description: string,
): Promise<void> {
  if (pence <= 0) return;
  const { error } = await admin.from("mechanic_ledger").insert({
    mechanic_id: mechanicId,
    booking_id: bookingId,
    entry_type: "refund_clawback",
    amount_pence: -pence,
    stripe_refund_id: stripeRefundId,
    created_by: createdBy,
    description,
  });
  if (error) console.error("Failed to record refund clawback for mechanic", mechanicId, error.message);
}
