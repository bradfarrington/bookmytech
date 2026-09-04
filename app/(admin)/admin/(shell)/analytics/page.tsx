import { format } from "date-fns";
import { PoundSterling, Receipt, CalendarCheck, Repeat, MapPin, Wrench } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Overline } from "@/components/ui/overline";
import { KPI, type KPIDeltaTone } from "@/components/ui/kpi";
import { formatPrice } from "@/lib/utils";
import {
  isPeriod,
  periodToRange,
  buildBuckets,
  bucketizeGmv,
  type SeriesRow,
} from "@/lib/analytics/periods";
import { PeriodSelector, type PeriodValue } from "./_components/period-selector";
import { GmvTrendChart, type GmvTrendDatum } from "./_components/gmv-trend-chart";
import { ServiceMixChart, type ServiceMixDatum } from "./_components/service-mix-chart";
import { RankedList, type RankedRow } from "./_components/ranked-list";
import { ConversionFunnel, type FunnelStep } from "./_components/conversion-funnel";

export const dynamic = "force-dynamic";

const FUNNEL_LABELS: Record<string, string> = {
  reg_lookup_started: "Reg lookup started",
  service_selected: "Repair selected",
  price_viewed: "Price viewed",
  slot_picked: "Slot picked",
  booking_confirmed: "Booked & confirmed",
};

interface BookingLite {
  id: string;
  status: string;
  area: string | null;
  total_pence: number | null;
  platform_fee_pence: number | null;
  repair_description: string | null;
  mechanic_id: string | null;
  customer_id: string | null;
  customer_email: string | null;
  created_at: string;
}

/** % change of `current` vs `prior` as a signed display string + tone. */
function delta(current: number, prior: number): { text: string; tone: KPIDeltaTone } {
  if (prior <= 0) {
    return current > 0
      ? { text: "New this period", tone: "success" }
      : { text: "vs previous period", tone: "neutral" };
  }
  const pct = Math.round(((current - prior) / prior) * 100);
  const sign = pct > 0 ? "+" : "";
  return {
    text: `${sign}${pct}% vs previous`,
    tone: pct > 0 ? "success" : pct < 0 ? "error" : "neutral",
  };
}

function customerKey(b: BookingLite): string | null {
  return b.customer_id ?? (b.customer_email ? b.customer_email.toLowerCase() : null);
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: periodParam } = await searchParams;
  const period: PeriodValue = isPeriod(periodParam) ? periodParam : "30d";
  const range = periodToRange(period);

  const supabase = await createClient();

  // A single bounded fetch powers KPIs, service mix, the top boards and
  // repeat-rate detection (which needs each customer's full history). At
  // marketplace scale this would move to a materialised view / RPC.
  const { data: allBookingsRaw } = await supabase
    .from("bookings")
    .select(
      "id, status, area, total_pence, platform_fee_pence, repair_description, mechanic_id, customer_id, customer_email, created_at",
    )
    .order("created_at", { ascending: true })
    .limit(5000);
  const allBookings = (allBookingsRaw ?? []) as BookingLite[];

  // Earliest booking per customer → lets us classify a booking as "repeat".
  const earliestByCustomer = new Map<string, number>();
  for (const b of allBookings) {
    const key = customerKey(b);
    if (!key) continue;
    const t = new Date(b.created_at).getTime();
    const cur = earliestByCustomer.get(key);
    if (cur === undefined || t < cur) earliestByCustomer.set(key, t);
  }

  const startMs = range.start.getTime();
  const endMs = range.end.getTime();
  const prevStartMs = range.prevStart.getTime();
  const prevEndMs = range.prevEnd.getTime();

  function inWindow(b: BookingLite, a: number, z: number): boolean {
    const t = new Date(b.created_at).getTime();
    return t >= a && t < z;
  }

  const periodBookings = allBookings.filter((b) => inWindow(b, startMs, endMs));
  const prevBookingsRows = allBookings.filter((b) => inWindow(b, prevStartMs, prevEndMs));

  const revenueable = (b: BookingLite) => b.status !== "cancelled";

  // --- KPIs -----------------------------------------------------------------
  const sumGmv = (rows: BookingLite[]) =>
    rows.filter(revenueable).reduce((s, b) => s + (b.total_pence ?? 0), 0);
  const sumNet = (rows: BookingLite[]) =>
    rows.filter(revenueable).reduce((s, b) => s + (b.platform_fee_pence ?? 0), 0);

  const gmvPence = sumGmv(periodBookings);
  const netPence = sumNet(periodBookings);
  const bookingsCount = periodBookings.length;
  const prevGmv = sumGmv(prevBookingsRows);
  const prevNet = sumNet(prevBookingsRows);
  const prevBookingsCount = prevBookingsRows.length;

  // Repeat rate: share of bookings placed by a customer who had booked before.
  function repeatRate(rows: BookingLite[]): number {
    if (rows.length === 0) return 0;
    let repeat = 0;
    for (const b of rows) {
      const key = customerKey(b);
      if (!key) continue;
      const earliest = earliestByCustomer.get(key);
      if (earliest !== undefined && earliest < new Date(b.created_at).getTime()) {
        repeat++;
      }
    }
    return Math.round((repeat / rows.length) * 100);
  }
  const repeatPct = repeatRate(periodBookings);
  const prevRepeatPct = repeatRate(prevBookingsRows);

  // --- GMV trend series (RPC, bucketed + gap-filled, current vs prior) -------
  const [curSeriesRes, prevSeriesRes, funnelRes] = await Promise.all([
    supabase.rpc("analytics_gmv_series", {
      p_start: range.start.toISOString(),
      p_end: range.end.toISOString(),
      p_granularity: range.granularity,
    }),
    supabase.rpc("analytics_gmv_series", {
      p_start: range.prevStart.toISOString(),
      p_end: range.prevEnd.toISOString(),
      p_granularity: range.granularity,
    }),
    supabase.rpc("analytics_funnel", {
      p_start: range.start.toISOString(),
      p_end: range.end.toISOString(),
    }),
  ]);

  const curBuckets = buildBuckets(range.start, range.end, range.granularity);
  const prevBuckets = buildBuckets(range.prevStart, range.prevEnd, range.granularity);
  const curGmv = bucketizeGmv((curSeriesRes.data ?? []) as SeriesRow[], curBuckets);
  const prevGmvSeries = bucketizeGmv((prevSeriesRes.data ?? []) as SeriesRow[], prevBuckets);

  const labelFmt = range.granularity === "week" ? "'w/c' d MMM" : "d MMM";
  const trendData: GmvTrendDatum[] = curBuckets.map((b, i) => ({
    label: format(b, labelFmt),
    current: curGmv[i] ?? 0,
    prior: i < prevGmvSeries.length ? prevGmvSeries[i] : null,
  }));

  // --- Repair mix + top areas + top mechanics (JS aggregation) --------------
  const mechanicIds = [...new Set(periodBookings.map((b) => b.mechanic_id).filter(Boolean))] as string[];

  const [{ data: mechProfiles }, { data: mechanics }] = await Promise.all([
    mechanicIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", mechanicIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    mechanicIds.length
      ? supabase.from("mechanics").select("id, rating, job_count").in("id", mechanicIds)
      : Promise.resolve({ data: [] as { id: string; rating: number; job_count: number }[] }),
  ]);

  const mechanicName = new Map((mechProfiles ?? []).map((p) => [p.id, p.full_name]));
  const mechanicMeta = new Map(
    (mechanics ?? []).map((m) => [m.id, { rating: Number(m.rating) }]),
  );

  const mixMap = new Map<string, number>();
  const areaMap = new Map<string, number>();
  const mechMap = new Map<string, number>();
  for (const b of periodBookings.filter(revenueable)) {
    const gmv = b.total_pence ?? 0;
    // A multi-job booking's summary is "X + 2 more jobs" — bucket it under X.
    const repair = (b.repair_description ?? "Vehicle repair").replace(/ \+ \d+ more jobs?$/, "");
    mixMap.set(repair, (mixMap.get(repair) ?? 0) + gmv);
    if (b.area) areaMap.set(b.area, (areaMap.get(b.area) ?? 0) + gmv);
    if (b.mechanic_id) mechMap.set(b.mechanic_id, (mechMap.get(b.mechanic_id) ?? 0) + gmv);
  }

  const serviceMix: ServiceMixDatum[] = [...mixMap.entries()]
    .map(([name, gmvPence]) => ({ name, gmvPence }))
    .sort((a, b) => b.gmvPence - a.gmvPence)
    .slice(0, 8);

  const topAreas: RankedRow[] = [...areaMap.entries()]
    .map(([area, gmvPence]) => ({ id: area, label: area, gmvPence }))
    .sort((a, b) => b.gmvPence - a.gmvPence)
    .slice(0, 6);

  const topMechanics: RankedRow[] = [...mechMap.entries()]
    .map(([id, gmvPence]) => {
      const meta = mechanicMeta.get(id);
      return {
        id,
        label: mechanicName.get(id) ?? "Mechanic",
        gmvPence,
        meta: meta && meta.rating > 0 ? `${meta.rating.toFixed(1)}★` : undefined,
      };
    })
    .sort((a, b) => b.gmvPence - a.gmvPence)
    .slice(0, 6);

  // --- Funnel ---------------------------------------------------------------
  const funnelRows = (
    (funnelRes.data ?? []) as { event_name: string; step_order: number; sessions: number }[]
  ).sort((a, b) => a.step_order - b.step_order);
  const funnelSteps: FunnelStep[] = funnelRows.map((r) => ({
    label: FUNNEL_LABELS[r.event_name] ?? r.event_name,
    sessions: Number(r.sessions) || 0,
  }));

  const gmvDelta = delta(gmvPence, prevGmv);
  const netDelta = delta(netPence, prevNet);
  const bookingsDelta = delta(bookingsCount, prevBookingsCount);
  const repeatDelta = delta(repeatPct, prevRepeatPct);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Overline>Commercial</Overline>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
            Analytics
          </h1>
          <p className="mt-1.5 text-sm text-text-muted">
            Marketplace performance over time — revenue, demand and conversion.
          </p>
        </div>
        <PeriodSelector current={period} />
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI label="GMV" value={formatPrice(gmvPence)} icon={PoundSterling} delta={gmvDelta.text} deltaTone={gmvDelta.tone} />
        <KPI label="Net revenue" value={formatPrice(netPence)} icon={Receipt} delta={netDelta.text} deltaTone={netDelta.tone} />
        <KPI label="Bookings" value={bookingsCount} icon={CalendarCheck} delta={bookingsDelta.text} deltaTone={bookingsDelta.tone} />
        <KPI label="Repeat rate" value={`${repeatPct}%`} icon={Repeat} delta={repeatDelta.text} deltaTone={repeatDelta.tone} />
      </div>

      <GmvTrendChart data={trendData} />

      <div className="grid gap-6 lg:grid-cols-2">
        <ServiceMixChart data={serviceMix} />
        <ConversionFunnel steps={funnelSteps} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RankedList title="Top areas" icon={MapPin} rows={topAreas} emptyLabel="No area GMV in this period yet." />
        <RankedList title="Top mechanics" icon={Wrench} rows={topMechanics} emptyLabel="No mechanic GMV in this period yet." />
      </div>
    </div>
  );
}
