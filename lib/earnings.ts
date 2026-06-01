// Mechanic earnings maths. Single source of truth so KPIs, the offer cards,
// and the job-detail breakdown all agree.
//
// Model: the platform commission is charged on the labour value (customer
// total minus any platform-supplied parts). Parts are reimbursed in full to
// whoever fronted them. Everything is integer pence.
//
//   labour       = total − parts
//   platform fee = round(labour × commissionRate)
//   mechanic     = labour − platform fee
//
// The commission rate is read from the booking (bookings.commission_rate),
// never hardcoded — Pro-tier mechanics (Task 11) get a lower locked-in rate.
// The parts system is Task 10, so partsPence is 0 for now.

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

  const labour = safeTotal - safeParts;
  const platformFeePence = Math.round(labour * rate);
  const mechanicPence = labour - platformFeePence;

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
