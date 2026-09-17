import { mechanicSharePence } from "@/lib/earnings";

// The money on a mechanic's job screen — one sum for the website's job page
// (app/(mechanic)/mechanic/(shell)/jobs/[id]/page.tsx) and the mechanic app
// (GET /api/mobile/v1/mechanic/bookings/[id]/job, Task 67), so neither has a
// copy of the commission or parts rules to drift.
//
// Commission is on the whole total and sourcing never changes it. A part the
// platform sources ('bmt') is money the platform keeps, so it comes off the
// mechanic's take-home; a part the mechanic sources ('self') stays in it. See
// app/actions/booking-parts.ts for the owner decision.

export interface JobMoneyBooking {
  total_pence: number | null;
  commission_rate: number | null;
  platform_fee_pence?: number | null;
  credit_applied_pence?: number | null;
  discount_pence?: number | null;
}

export interface JobMoneyPart {
  total_pence: number | null;
  sourcing: string | null;
}

export interface JobMoney {
  /** The job's full price. */
  customerPaysPence: number;
  /** What "Complete job & charge" captures: total − account credit − promo discount. */
  chargePence: number;
  /** Σ of the parts Book My Tech is sourcing. */
  bmtPartsPence: number;
  platformFeePence: number;
  commissionRate: number;
  /** The mechanic's take-home: their share of the total, less BMT-sourced parts. */
  payoutPence: number;
}

export const DEFAULT_COMMISSION_RATE = 0.15;

export function jobMoney(booking: JobMoneyBooking, parts: readonly JobMoneyPart[]): JobMoney {
  const total = booking.total_pence ?? 0;
  const commissionRate = booking.commission_rate ?? DEFAULT_COMMISSION_RATE;
  const share = mechanicSharePence(total, commissionRate);
  const bmtPartsPence = parts
    .filter((p) => p.sourcing === "bmt")
    .reduce((sum, p) => sum + (p.total_pence ?? 0), 0);
  return {
    customerPaysPence: total,
    chargePence: Math.max(0, total - (booking.credit_applied_pence ?? 0) - (booking.discount_pence ?? 0)),
    bmtPartsPence,
    platformFeePence: booking.platform_fee_pence ?? total - share,
    commissionRate,
    payoutPence: share - bmtPartsPence,
  };
}
