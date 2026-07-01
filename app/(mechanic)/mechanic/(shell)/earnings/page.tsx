import { redirect } from "next/navigation";
import { PoundSterling, Folder, Calculator, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { KPI } from "@/components/ui/kpi";
import { mechanicSharePence } from "@/lib/earnings";
import { formatPrice } from "@/lib/utils";
import { Overline } from "@/components/ui/overline";
import { EarningsChart, type EarningsPoint } from "./_components/earnings-chart";
import { PayoutsTable, type PayoutRow } from "./_components/payouts-table";

export const dynamic = "force-dynamic";

interface CompletedRow {
  total_pence: number | null;
  commission_rate: number | null;
  mechanic_payout_pence: number | null;
  completed_at: string | null;
}

const CHART_DAYS = 90;
const MS_DAY = 86_400_000;

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

// yyyy-mm-dd in LOCAL time (not toISOString, which is UTC and can shift the day).
function localISODate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Monday of the week containing d.
function startOfWeek(d: Date): Date {
  const out = startOfDay(d);
  const diff = (out.getDay() + 6) % 7;
  out.setDate(out.getDate() - diff);
  return out;
}

export default async function MechanicEarningsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/mechanic/login");

  const { data: mechanic } = await supabase
    .from("mechanics")
    .select("stripe_account_id")
    .eq("id", user.id)
    .single();

  // Balance ledger (0034). Instant-pay means this sits at ~£0 — it only goes
  // negative when a refund BMT fronted is being recovered from upcoming payouts.
  const { data: ledgerRows } = await supabase
    .from("mechanic_ledger")
    .select("entry_type, amount_pence")
    .eq("mechanic_id", user.id);
  let ledgerEarned = 0;
  let ledgerPaid = 0;
  let ledgerBalance = 0;
  for (const r of ledgerRows ?? []) {
    const a = r.amount_pence ?? 0;
    ledgerBalance += a;
    if (r.entry_type === "earning") ledgerEarned += a;
    else if (r.entry_type === "payout") ledgerPaid += -a;
  }
  const hasLedger = (ledgerRows ?? []).length > 0;

  const since = new Date(Date.now() - CHART_DAYS * MS_DAY).toISOString();
  const { data: completedRows } = await supabase
    .from("bookings")
    .select("total_pence, commission_rate, mechanic_payout_pence, completed_at")
    .eq("mechanic_id", user.id)
    .eq("status", "completed")
    .gte("completed_at", since)
    .order("completed_at", { ascending: true });

  const completed = (completedRows ?? []) as CompletedRow[];

  // --- Daily series (oldest → newest), zero-filled across the window. --------
  const todayStart = startOfDay(new Date());
  const byDay = new Map<string, number>();
  for (let i = CHART_DAYS - 1; i >= 0; i--) {
    byDay.set(localISODate(new Date(todayStart.getTime() - i * MS_DAY)), 0);
  }

  // --- This-month + weekly (payout) aggregates -----------------------------
  const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
  let monthPence = 0;
  let monthJobs = 0;
  const byWeek = new Map<string, number>(); // week-start ISO → pence

  for (const c of completed) {
    if (!c.completed_at) continue;
    // Prefer the payout snapshotted on the booking at creation (Task 08);
    // fall back to the live calc for legacy rows predating the column.
    const share =
      c.mechanic_payout_pence ??
      mechanicSharePence(c.total_pence ?? 0, c.commission_rate ?? 0.15);
    const when = new Date(c.completed_at);

    const key = localISODate(when);
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + share);

    if (when >= monthStart) {
      monthPence += share;
      monthJobs += 1;
    }

    const weekKey = localISODate(startOfWeek(when));
    byWeek.set(weekKey, (byWeek.get(weekKey) ?? 0) + share);
  }

  const series: EarningsPoint[] = Array.from(byDay.entries()).map(([date, pence]) => ({
    date,
    pence,
  }));

  // --- KPIs -----------------------------------------------------------------
  const avgPerJob = monthJobs > 0 ? Math.round(monthPence / monthJobs) : 0;

  const daysInMonth = new Date(
    todayStart.getFullYear(),
    todayStart.getMonth() + 1,
    0,
  ).getDate();
  const dayOfMonth = todayStart.getDate();
  // Linear run-rate projection from month-to-date earnings.
  const projectedPence =
    dayOfMonth > 0 ? Math.round((monthPence / dayOfMonth) * daysInMonth) : monthPence;

  const monthLabel = todayStart.toLocaleDateString("en-GB", { month: "long" });

  // --- Payouts --------------------------------------------------------------
  // Real Stripe transfer history once the mechanic is connected; otherwise the
  // weekly-accrual preview (Task 08 Stage 3).
  const stripePayouts = await fetchStripePayouts(mechanic?.stripe_account_id ?? null);
  const payouts = stripePayouts ?? buildPayoutRows(byWeek);

  return (
    <div className="space-y-6">
      <header>
        <Overline>Mechanic</Overline>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-text-primary">
          Earnings &amp; payouts
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Your share after the platform fee, across completed jobs.
        </p>
      </header>

      {hasLedger && (
        <div
          className={
            ledgerBalance < 0
              ? "rounded-card border border-red-200 bg-red-50 p-5"
              : "rounded-card border border-border bg-surface-card p-5"
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                {ledgerBalance < 0 ? "Balance being recovered" : "Current balance"}
              </p>
              <p
                className={
                  ledgerBalance < 0
                    ? "mt-0.5 text-2xl font-bold text-red-600"
                    : "mt-0.5 text-2xl font-bold text-text-primary"
                }
              >
                {ledgerBalance < 0 ? "−" : ""}
                {formatPrice(Math.abs(ledgerBalance))}
              </p>
            </div>
            <div className="flex gap-6 text-right">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                  Lifetime earned
                </p>
                <p className="mt-0.5 text-lg font-bold text-text-primary">
                  {formatPrice(ledgerEarned)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted">
                  Paid out
                </p>
                <p className="mt-0.5 text-lg font-bold text-text-primary">
                  {formatPrice(ledgerPaid)}
                </p>
              </div>
            </div>
          </div>
          {ledgerBalance < 0 && (
            <p className="mt-3 text-xs text-red-700">
              A refund on one of your jobs was covered by Book My Tech. This amount is
              being recovered from your upcoming payouts — your next job&apos;s earnings
              clear it first, then the rest is paid out as normal.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI
          label={`${monthLabel} earnings`}
          value={formatPrice(monthPence)}
          delta="Month to date"
          icon={PoundSterling}
        />
        <KPI
          label="Jobs completed"
          value={monthJobs}
          delta={`In ${monthLabel}`}
          icon={Folder}
        />
        <KPI
          label="Average per job"
          value={monthJobs > 0 ? formatPrice(avgPerJob) : "—"}
          delta={monthJobs > 0 ? "This month" : "No jobs yet"}
          icon={Calculator}
        />
        <KPI
          label="Projected"
          value={monthJobs > 0 ? formatPrice(projectedPence) : "—"}
          delta={`End of ${monthLabel} (run rate)`}
          icon={TrendingUp}
        />
      </div>

      <EarningsChart series={series} />

      <PayoutsTable rows={payouts} live={stripePayouts !== null} />
    </div>
  );
}

// Build weekly payout rows from real weekly earnings (most recent first). The
// current (in-progress) week shows as Pending, settled weeks as Paid. When the
// mechanic has no completed jobs yet, fall back to a clearly-labelled seed so
// the preview table still shows the intended shape (real payouts: Task 08).
function buildPayoutRows(byWeek: Map<string, number>): PayoutRow[] {
  const MASK = "•••• 4242";
  const fmtDate = (d: Date) =>
    d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const periodLabel = (weekStart: Date) => {
    const end = new Date(weekStart.getTime() + 6 * MS_DAY);
    return `${weekStart.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`;
  };

  const thisWeekStart = startOfWeek(new Date());

  const realWeeks = Array.from(byWeek.entries())
    .filter(([, pence]) => pence > 0)
    .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // newest first
    .slice(0, 6);

  if (realWeeks.length > 0) {
    return realWeeks.map(([weekKey, pence]) => {
      const weekStart = new Date(`${weekKey}T00:00:00`);
      const isCurrent = weekStart.getTime() === thisWeekStart.getTime();
      // Payout settles the Monday after the week closes.
      const payoutDate = new Date(weekStart.getTime() + 7 * MS_DAY);
      return {
        id: weekKey,
        dateLabel: fmtDate(payoutDate),
        amountPence: pence,
        status: isCurrent ? "pending" : "paid",
        periodLabel: periodLabel(weekStart),
        accountMask: MASK,
      };
    });
  }

  // Seed fallback — three prior weeks of representative amounts.
  return [0, 1, 2].map((i) => {
    const weekStart = new Date(thisWeekStart.getTime() - (i + 1) * 7 * MS_DAY);
    const payoutDate = new Date(weekStart.getTime() + 7 * MS_DAY);
    return {
      id: `seed-${i}`,
      dateLabel: fmtDate(payoutDate),
      amountPence: [0, 18_900, 24_250, 0][i] || 21_000,
      status: "paid" as const,
      periodLabel: periodLabel(weekStart),
      accountMask: MASK,
    };
  });
}

// Real payout history from Stripe transfers to the mechanic's connected
// account. Returns null (→ caller uses the preview) when the mechanic isn't
// connected or Stripe isn't configured. Transfers move funds to the connected
// balance immediately, so they show as Paid.
async function fetchStripePayouts(accountId: string | null): Promise<PayoutRow[] | null> {
  if (!accountId) return null;
  let stripe;
  try {
    stripe = (await import("@/lib/stripe/server")).stripe;
  } catch {
    return null;
  }
  try {
    const { data: transfers } = await stripe.transfers.list({
      destination: accountId,
      limit: 12,
    });
    return transfers.map((t) => {
      const when = new Date(t.created * 1000);
      return {
        id: t.id,
        dateLabel: when.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
        }),
        amountPence: t.amount,
        status: "paid" as const,
        periodLabel: when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
        accountMask: "Bank account",
      };
    });
  } catch (err) {
    console.error("Failed to fetch Stripe transfers", err);
    return null;
  }
}
