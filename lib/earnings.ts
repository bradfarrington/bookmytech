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

/** Convenience: just the mechanic's take-home pence. */
export function mechanicSharePence(
  totalPence: number,
  commissionRate: number,
  partsPence = 0,
): number {
  return calcEarnings(totalPence, commissionRate, partsPence).mechanicPence;
}
