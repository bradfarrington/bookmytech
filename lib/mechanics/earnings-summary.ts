import "server-only";
import { mechanicBalanceSummary, type BalanceSummary } from "@/lib/mechanics/balance";
import { getTakeRateBase } from "@/lib/pricing/calculate";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatJobNumber } from "@/lib/utils";

// What the mechanic app's Earnings screen cannot work out for itself
// (GET /api/mobile/v1/mechanic/earnings, Task 70).
//
// The app reads `mechanic_ledger` and its own completed `bookings` under RLS and
// does the month-to-date, average and projection sums client-side, exactly as
// the website's earnings page does. What it cannot do is see STRIPE: the balance
// aggregate, the bank account behind the payouts and the real transfer history
// all need the secret key or the service role.
//
// Mechanics are paid PER JOB on completion (owner decision 2026-07-01), so there
// is no "next payout" here and none is drawn. The website's `buildPayoutRows`
// weekly preview — and its `•••• 4242` seed — is deliberately NOT ported: it is
// a mock-up of a payout model we don't run.

export interface MechanicPayout {
  /** The Stripe transfer id, `tr_…`. */
  id: string;
  at: string;
  amountPence: number;
  status: "paid" | "reversed";
  /** The job it paid for, when the transfer or the ledger names one. */
  bookingId: string | null;
  /** "Front brake pads & discs · Job 00123", when the booking is still readable. */
  description: string | null;
}

export interface MechanicEarnings {
  balance: BalanceSummary;
  /** The rate their next job will be charged at, as a fraction. */
  commissionRate: number;
  account: { bankName: string | null; last4: string | null } | null;
  payouts: MechanicPayout[];
  /**
   * False when Connect isn't set up or Stripe isn't configured, so the app can
   * say "Payouts start once you're set up" rather than "No payouts yet".
   */
  payoutsLive: boolean;
}

type Connect = typeof import("@/lib/stripe/connect");

/** Lazy, so the app still runs without STRIPE_SECRET_KEY in dev. */
async function loadConnect(): Promise<Connect | null> {
  try {
    return await import("@/lib/stripe/connect");
  } catch {
    return null;
  }
}

export async function mechanicEarningsFor(mechanicId: string): Promise<MechanicEarnings> {
  const admin = createAdminClient();

  const [balance, commissionRate, mechanic] = await Promise.all([
    mechanicBalanceSummary(admin, mechanicId),
    // `take_rate_base`. `is_pro` is deliberately not consulted: `take_rate_pro`
    // is never applied anywhere (Task 11 Stage 2 deferred), so quoting it here
    // would put a number on the mechanic's screen that their next job won't use.
    getTakeRateBase(admin),
    admin
      .from("mechanics")
      .select("stripe_account_id")
      .eq("id", mechanicId)
      .maybeSingle()
      .then(({ data }) => data as { stripe_account_id: string | null } | null),
  ]);

  const accountId = mechanic?.stripe_account_id ?? null;
  const connect = accountId ? await loadConnect() : null;
  if (!accountId || !connect) {
    return { balance, commissionRate, account: null, payouts: [], payoutsLive: false };
  }

  const [account, transfers] = await Promise.all([
    connect.primaryExternalAccount(accountId).catch((err) => {
      console.error("[mechanic/earnings] bank account lookup failed", mechanicId, err);
      return null;
    }),
    connect.listTransfersTo(accountId, 12).catch((err) => {
      console.error("[mechanic/earnings] transfer list failed", mechanicId, err);
      return null;
    }),
  ]);

  // A Stripe outage must not blank the screen, but it must not lie about it
  // either: no transfers AND no live read is "not live", so the app says the
  // set-up line rather than "no payouts yet".
  if (!transfers) {
    return { balance, commissionRate, account, payouts: [], payoutsLive: false };
  }

  return {
    balance,
    commissionRate,
    account,
    payouts: await describeTransfers(admin, mechanicId, transfers),
    payoutsLive: true,
  };
}

interface TransferLite {
  id: string;
  created: number;
  amount: number;
  reversed: boolean;
  metadata: Record<string, string>;
  description: string | null;
}

/**
 * Name each transfer's job. The booking id comes from the transfer's own
 * metadata (`payoutToMechanic` writes it) and falls back to the `payout` ledger
 * row that recorded the same transfer — older transfers predate the metadata.
 */
async function describeTransfers(
  admin: ReturnType<typeof createAdminClient>,
  mechanicId: string,
  transfers: ReadonlyArray<TransferLite>,
): Promise<MechanicPayout[]> {
  const ids = transfers.map((t) => t.id);
  const { data: ledgerRows } = await admin
    .from("mechanic_ledger")
    .select("stripe_transfer_id, booking_id")
    .eq("mechanic_id", mechanicId)
    .eq("entry_type", "payout")
    .in("stripe_transfer_id", ids.length > 0 ? ids : ["-"]);
  const bookingByTransfer = new Map(
    (ledgerRows ?? []).map((r) => [r.stripe_transfer_id as string, r.booking_id as string | null]),
  );

  const bookingIdFor = (t: TransferLite): string | null =>
    t.metadata?.booking_id || bookingByTransfer.get(t.id) || null;

  const bookingIds = [...new Set(transfers.map(bookingIdFor).filter((id): id is string => !!id))];
  const { data: bookings } = bookingIds.length
    ? await admin
        .from("bookings")
        .select("id, job_number, repair_description")
        .in("id", bookingIds)
    : { data: [] };
  const bookingById = new Map(
    (bookings ?? []).map((b) => [
      b.id as string,
      { jobNumber: b.job_number as number | null, service: b.repair_description as string | null },
    ]),
  );

  return transfers.map((t) => {
    const bookingId = bookingIdFor(t);
    const booking = bookingId ? bookingById.get(bookingId) : undefined;
    const parts = booking
      ? [
          booking.service?.trim() || null,
          booking.jobNumber == null ? null : `Job ${formatJobNumber(booking.jobNumber)}`,
        ]
      : [t.description?.trim() || null];
    return {
      id: t.id,
      at: new Date(t.created * 1000).toISOString(),
      amountPence: t.amount,
      status: t.reversed ? ("reversed" as const) : ("paid" as const),
      bookingId,
      description: parts.filter(Boolean).join(" · ") || null,
    };
  });
}
