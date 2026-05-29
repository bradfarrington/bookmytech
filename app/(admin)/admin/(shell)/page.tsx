import { createClient } from "@/lib/supabase/server";
import { Overline } from "@/components/ui/overline";
import { KpiCards } from "./_components/kpi-cards";
import { LiveMonitor, type MonitorRow } from "./_components/live-monitor";
import {
  NeedsAttention,
  type NeedsAttentionData,
  type UndersuppliedArea,
} from "./_components/needs-attention";
import { DemandChart, type DemandDatum } from "./_components/demand-chart";

// Overview is always live data.
export const dynamic = "force-dynamic";

const LIVE_STATUSES = new Set(["confirmed", "en_route", "in_progress"]);
// Statuses that still need supply (live work + work awaiting a mechanic).
const ACTIVE_STATUSES = new Set([
  "sourcing_mechanic",
  "confirmed",
  "en_route",
  "in_progress",
]);
const MIN_MECHANICS_PER_AREA = 2;

// UK postcode district = the outward code (before the space). Mirrors the
// derive_postcode_district() SQL so mechanic base postcodes line up with the
// booking `area` column the DB trigger already computes.
function district(postcode: string | null): string | null {
  if (!postcode || !postcode.trim()) return null;
  return postcode.trim().toUpperCase().split(/\s+/)[0];
}

export default async function AdminOverviewPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user!.id)
    .single();

  const firstName =
    profile?.full_name?.trim().split(" ")[0] ||
    user?.email?.split("@")[0] ||
    "there";

  // --- Fetch ----------------------------------------------------------------
  const { data: bookingsRaw } = await supabase
    .from("bookings")
    .select(
      "id, status, area, total_pence, customer_name, mechanic_id, service_id, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(1000);

  const bookings = bookingsRaw ?? [];

  // Resolve service + assigned-mechanic names in bulk (avoids brittle embedded
  // FK joins; admins can read all profiles via the is_admin() policy).
  const serviceIds = [...new Set(bookings.map((b) => b.service_id).filter(Boolean))];
  const mechanicIds = [...new Set(bookings.map((b) => b.mechanic_id).filter(Boolean))];

  const [{ data: services }, { data: mechProfiles }, { data: mechanics }] =
    await Promise.all([
      serviceIds.length
        ? supabase.from("services").select("id, name").in("id", serviceIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      mechanicIds.length
        ? supabase.from("profiles").select("id, full_name").in("id", mechanicIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
      supabase.from("mechanics").select("id, status, base_postcode, rating, job_count"),
    ]);

  const serviceName = new Map((services ?? []).map((s) => [s.id, s.name]));
  const mechanicName = new Map(
    (mechProfiles ?? []).map((p) => [p.id, p.full_name]),
  );

  // --- KPIs -----------------------------------------------------------------
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();

  const liveBookings = bookings.filter((b) => LIVE_STATUSES.has(b.status)).length;
  const gmvTodayPence = bookings
    .filter((b) => new Date(b.created_at).getTime() >= startOfToday)
    .reduce((sum, b) => sum + (b.total_pence ?? 0), 0);
  const mechanicsOnline = (mechanics ?? []).filter((m) => m.status === "online").length;

  // --- Monitor rows ---------------------------------------------------------
  const monitorRows: MonitorRow[] = bookings.map((b) => ({
    id: b.id,
    service: serviceName.get(b.service_id) ?? "Unknown service",
    customer: b.customer_name ?? "—",
    mechanic: b.mechanic_id ? mechanicName.get(b.mechanic_id) ?? "Assigned" : null,
    area: b.area,
    status: b.status,
    totalPence: b.total_pence ?? 0,
  }));

  // --- Supply per area ------------------------------------------------------
  const onlineByArea = new Map<string, number>();
  for (const m of mechanics ?? []) {
    if (m.status !== "online") continue;
    const d = district(m.base_postcode);
    if (d) onlineByArea.set(d, (onlineByArea.get(d) ?? 0) + 1);
  }

  // --- Demand by area (all bookings) ---------------------------------------
  const bookingsByArea = new Map<string, number>();
  const activeByArea = new Map<string, number>();
  for (const b of bookings) {
    if (!b.area) continue;
    bookingsByArea.set(b.area, (bookingsByArea.get(b.area) ?? 0) + 1);
    if (ACTIVE_STATUSES.has(b.status)) {
      activeByArea.set(b.area, (activeByArea.get(b.area) ?? 0) + 1);
    }
  }

  const demandData: DemandDatum[] = [...bookingsByArea.entries()]
    .map(([area, count]) => ({
      area,
      count,
      undersupplied: (onlineByArea.get(area) ?? 0) < MIN_MECHANICS_PER_AREA,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // --- Needs attention ------------------------------------------------------
  const undersuppliedAreas: UndersuppliedArea[] = [...activeByArea.entries()]
    .map(([area, activeBookings]) => ({
      area,
      activeBookings,
      onlineMechanics: onlineByArea.get(area) ?? 0,
    }))
    .filter((a) => a.onlineMechanics < MIN_MECHANICS_PER_AREA)
    .sort((a, b) => b.activeBookings - a.activeBookings);

  const perfFlags = (mechanics ?? [])
    .filter((m) => m.job_count > 0 && Number(m.rating) > 0 && Number(m.rating) < 4)
    .map((m) => ({
      name: mechanicName.get(m.id) ?? "Mechanic",
      rating: Number(m.rating),
    }));

  const openDisputes = bookings.filter((b) => b.status === "disputed").length;

  const needsAttention: NeedsAttentionData = {
    undersuppliedAreas,
    perfFlags,
    openDisputes,
  };

  return (
    <div className="space-y-6">
      <header>
        <Overline>Operations</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
          Welcome back, {firstName}.
        </h1>
        <p className="mt-1.5 text-sm text-text-muted">
          The marketplace at a glance — live bookings, supply, and demand.
        </p>
      </header>

      <KpiCards
        kpis={{ liveBookings, gmvTodayPence, mechanicsOnline }}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LiveMonitor rows={monitorRows} />
        </div>
        <div>
          <NeedsAttention data={needsAttention} />
        </div>
      </div>

      <DemandChart data={demandData} />
    </div>
  );
}
