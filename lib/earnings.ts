// Mechanic earnings maths. Single source of truth so KPIs, the offer cards,
// and the job-detail breakdown all agree.
//
// Model (Task 08, owner decision 2026-06-04): the platform commission is
// charged on the WHOLE total (base labour + parts), and the mechanic keeps the
// rest — including any parts money, which covers parts they fronted. Everything
// is integer pence.
//
//   platform fee = round(total × commissionRate)
//   mechanic     = total − platform fee
//
// This supersedes the earlier labour-only model. It mirrors the pricing engine
// (lib/pricing/calculate.ts), so a booking's snapshotted mechanic_payout_pence
// equals calcEarnings(total, rate).mechanicPence. The commission rate is read
// from the booking (bookings.commission_rate), never hardcoded — Pro-tier
// mechanics (Task 11) get a lower locked-in rate. partsPence is informational
// (returned for display); the full parts system is Task 10.

export interface EarningsBreakdown {
  /** What the customer pays — bookings.total_pence. */
  customerPence: number;
  /** Cost of platform-supplied parts (0 until Task 10). */
  partsPence: number;
  /** Commission rate applied, e.g. 0.15. */
  commissionRate: number;
  /** Platform fee in pence. */
  platformFeePence: number;
  /** What the mechanic receives in pence. */
  mechanicPence: number;
}

export function calcEarnings(
  totalPence: number,
  commissionRate: number,
  partsPence = 0,
): EarningsBreakdown {
  const safeTotal = Math.max(0, Math.round(totalPence || 0));
  const safeParts = Math.max(0, Math.min(safeTotal, Math.round(partsPence || 0)));
  const rate = Number.isFinite(commissionRate) ? commissionRate : 0.15;

  // Commission on the whole total; mechanic keeps the remainder (incl. parts).
  const platformFeePence = Math.round(safeTotal * rate);
  const mechanicPence = safeTotal - platformFeePence;

  return {
    customerPence: safeTotal,
    partsPence: safeParts,
    commissionRate: rate,
    platformFeePence,
    mechanicPence,
  };
}

/**
 * Net a job's gross payout against the mechanic's prior balance to work out what
 * to actually transfer. Mechanics are paid instantly, but a refund BMT fronted on
 * an earlier job leaves their balance NEGATIVE (a debt); that debt is recovered
 * off this payout before any cash goes out.
 *
 *   priorBalancePence ≤ 0 normally (0 = settled, negative = owes BMT).
 *   transferPence  = what actually transfers to the mechanic (never negative,
 *                    never more than the surplus after clearing the debt).
 *   recoveredPence = how much of this payout was withheld to clear the debt.
 *
 * A positive prior balance (BMT owes the mechanic — e.g. an earlier transfer
 * failed) is carried forward untouched here; recoveredPence stays 0.
 */
/**
 * Split one payout across the charges it can be drawn from (Task 33). A
 * Stripe transfer with `source_transaction` can't exceed that charge, so a
 * job paid with a base hold plus an approved-quote hold needs one transfer
 * per charge. Greedy in order, each capped at its capture; `unallocated` is
 * whatever couldn't be sourced (only when the payout exceeds what was
 * captured — a free booking, or nothing captured at all).
 */
export function allocateTransfers(
  charges: ReadonlyArray<{ id: string; capturedPence: number }>,
  transferPence: number,
): { allocations: Array<{ id: string; pence: number }>; unallocated: number } {
  let remaining = Math.max(0, Math.round(transferPence || 0));
  const allocations: Array<{ id: string; pence: number }> = [];
  for (const charge of charges) {
    if (remaining <= 0) break;
    const cap = Math.max(0, Math.round(charge.capturedPence || 0));
    const pence = Math.min(cap, remaining);
    if (pence <= 0) continue;
    allocations.push({ id: charge.id, pence });
    remaining -= pence;
  }
  return { allocations, unallocated: remaining };
}

export function nettedPayout(
  priorBalancePence: number,
  grossPayoutPence: number,
): { transferPence: number; recoveredPence: number } {
  const gross = Math.max(0, Math.round(grossPayoutPence || 0));
  const balanceAfterEarning = Math.round(priorBalancePence || 0) + gross;
  const transferPence = Math.max(0, balanceAfterEarning);
  const recoveredPence = Math.max(0, gross - transferPence);
  return { transferPence, recoveredPence };
}

/** Convenience: just the mechanic's take-home pence. */
export function mechanicSharePence(
  totalPence: number,
  commissionRate: number,
  partsPence = 0,
): number {
  return calcEarnings(totalPence, commissionRate, partsPence).mechanicPence;
}
