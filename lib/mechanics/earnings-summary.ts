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
// PAYOUTS COME FROM THE LEDGER, not from `stripe.transfers.list({ destination })`
// (owner decision 2026-09-18). Every transfer `payoutToMechanic` makes is
// recorded as a `payout` row carrying its `stripe_transfer_id`, so the ledger is
// the complete list of what we sent this mechanic — whichever Connect account it
// went to. Listing by the CURRENT account hid everything sent to an earlier one
// the moment an account was replaced. Each transfer is then read from Stripe by
// id for its live state (a reversal, the exact time); if Stripe can't produce
// one, the ledger row still shows, from its own figures.
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
   * False when there's no Connect account to pay into now, or Stripe isn't
   * configured, so the app can say "Payouts start once you're set up" rather
   * than "No payouts yet". Earlier payouts can still be listed while it's false.
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
  const connect = await loadConnect();

  const [account, payouts] = await Promise.all([
    accountId && connect
      ? connect.primaryExternalAccount(accountId).catch((err) => {
          console.error("[mechanic/earnings] bank account lookup failed", mechanicId, err);
          return null;
        })
      : Promise.resolve(null),
    ledgerPayouts(admin, mechanicId, connect),
  ]);

  return {
    balance,
    commissionRate,
    account,
    payouts,
    // "Set up" is about NOW: a Connect account to pay into and Stripe to pay
    // with. A mechanic whose account was replaced still has earlier payouts in
    // `payouts`; this only says whether the next one can go.
    payoutsLive: !!accountId && !!connect,
  };
}

const PAYOUT_LIMIT = 12;

interface LedgerPayoutRow {
  booking_id: string | null;
  amount_pence: number;
  stripe_transfer_id: string;
  description: string | null;
  created_at: string;
}

interface TransferLite {
  created: number;
  amount: number;
  reversed: boolean;
  metadata: Record<string, string>;
  description: string | null;
}

/**
 * The mechanic's last `PAYOUT_LIMIT` transfers, newest first, from the ledger.
 *
 * Each is read from Stripe by id, in parallel, for its live state. A transfer
 * Stripe won't return — a key for a different mode, a transient failure — is not
 * dropped: the ledger row is the record that we sent it, so it shows from the
 * ledger's own amount and time, as `paid`.
 *
 * `bookingId` is only given when the booking still exists, so the app never
 * links to a job it can't open; `description` then falls back to the ledger's
 * own wording ("Job 00123 payout").
 */
async function ledgerPayouts(
  admin: ReturnType<typeof createAdminClient>,
  mechanicId: string,
  connect: Connect | null,
): Promise<MechanicPayout[]> {
  const { data, error } = await admin
    .from("mechanic_ledger")
    .select("booking_id, amount_pence, stripe_transfer_id, description, created_at")
    .eq("mechanic_id", mechanicId)
    .eq("entry_type", "payout")
    .not("stripe_transfer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(PAYOUT_LIMIT);
  if (error) throw new Error(`ledger payouts: ${error.message}`);
  const rows = (data ?? []) as LedgerPayoutRow[];
  if (rows.length === 0) return [];

  const transfers = await Promise.all(
    rows.map((r) =>
      connect
        ? connect.retrieveTransfer(r.stripe_transfer_id).catch((err) => {
            console.error("[mechanic/earnings] transfer lookup failed", r.stripe_transfer_id, err?.message ?? err);
            return null;
          })
        : Promise.resolve(null),
    ),
  );

  const candidateIds = [
    ...new Set(
      rows
        .map((r, i) => r.booking_id || transfers[i]?.metadata?.booking_id || null)
        .filter((id): id is string => !!id),
    ),
  ];
  const { data: bookings } = candidateIds.length
    ? await admin.from("bookings").select("id, job_number, repair_description").in("id", candidateIds)
    : { data: [] };
  const bookingById = new Map(
    (bookings ?? []).map((b) => [
      b.id as string,
      { jobNumber: b.job_number as number | null, service: b.repair_description as string | null },
    ]),
  );

  return rows.map((r, i) => {
    const t: TransferLite | null = transfers[i];
    const candidate = r.booking_id || t?.metadata?.booking_id || null;
    const booking = candidate ? bookingById.get(candidate) : undefined;
    const parts = booking
      ? [
          booking.service?.trim() || null,
          booking.jobNumber == null ? null : `Job ${formatJobNumber(booking.jobNumber)}`,
        ]
      : [r.description?.trim() || t?.description?.trim() || null];
    return {
      id: r.stripe_transfer_id,
      at: t ? new Date(t.created * 1000).toISOString() : new Date(r.created_at).toISOString(),
      amountPence: t ? t.amount : Math.abs(r.amount_pence),
      status: t?.reversed ? ("reversed" as const) : ("paid" as const),
      bookingId: booking ? candidate : null,
      description: parts.filter(Boolean).join(" · ") || null,
    };
  });
}
