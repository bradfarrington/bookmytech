import { Wrench, Hourglass, Inbox, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatJobNumber } from "@/lib/utils";
import { Overline } from "@/components/ui/overline";
import { KPI } from "@/components/ui/kpi";
import { LiveMonitor, type MonitorRow } from "../_components/live-monitor";
import { MechanicsOnline, type OnlineMechanic } from "./_components/mechanics-online";
import { ActivityFeed, type ActivityEvent } from "./_components/activity-feed";

// The live monitor is always real-time data; the LiveMonitor table polls and
// calls router.refresh() on a 15s cadence, which re-runs this whole server
// component — so the KPIs, mechanics panel and activity feed all stay fresh too.
export const dynamic = "force-dynamic";

const LIVE_STATUSES = new Set(["confirmed", "en_route", "in_progress"]);
const ONLINE_STATUSES = new Set(["online", "on_job"]);

// UK postcode district (outward code) — mirrors the DB's derived booking `area`.
function district(postcode: string | null): string | null {
  if (!postcode || !postcode.trim()) return null;
  return postcode.trim().toUpperCase().split(/\s+/)[0];
}

export default async function AdminLiveMonitorPage() {
  const supabase = await createClient();

  const [
    { data: bookingsRaw },
    { data: mechanicsRaw },
    { count: openOffers },
    { data: eventsRaw },
  ] = await Promise.all([
    supabase
      .from("bookings")
      .select(
        "id, job_number, status, area, total_pence, customer_name, mechanic_id, repair_description, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("mechanics").select("id, status, base_postcode, rating"),
    supabase
      .from("job_offers")
      .select("id", { count: "exact", head: true })
      .is("response", null),
    supabase
      .from("booking_events")
      .select("id, booking_id, event_type, actor_role, payload, created_at")
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  const bookings = bookingsRaw ?? [];
  const mechanics = mechanicsRaw ?? [];
  const events = eventsRaw ?? [];

  // Resolve mechanic display names in bulk (admins read all profiles
  // via the is_admin() policy — avoids brittle embedded FK joins).
  const onlineMechs = mechanics.filter((m) => ONLINE_STATUSES.has(m.status));
  const nameIds = [
    ...new Set([
      ...bookings.map((b) => b.mechanic_id).filter(Boolean),
      ...onlineMechs.map((m) => m.id),
    ]),
  ];

  const { data: profiles } = nameIds.length
    ? await supabase.from("profiles").select("id, full_name").in("id", nameIds)
    : { data: [] as { id: string; full_name: string | null }[] };

  const profileName = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

  // --- KPIs -----------------------------------------------------------------
  const liveJobs = bookings.filter((b) => LIVE_STATUSES.has(b.status)).length;
  const awaitingMechanic = bookings.filter((b) => b.status === "sourcing_mechanic").length;
  const onlineCount = mechanics.filter((m) => m.status === "online").length;
  const onJobCount = mechanics.filter((m) => m.status === "on_job").length;

  // --- Live jobs table (reuses the overview's monitor component) ------------
  const monitorRows: MonitorRow[] = bookings.map((b) => ({
    id: b.id,
    jobNumber: b.job_number,
    service: b.repair_description ?? "Vehicle repair",
    customer: b.customer_name ?? "—",
    mechanic: b.mechanic_id ? profileName.get(b.mechanic_id) ?? "Assigned" : null,
    area: b.area,
    status: b.status,
    totalPence: b.total_pence ?? 0,
  }));

  // --- Mechanics available --------------------------------------------------
  const onlineMechanics: OnlineMechanic[] = onlineMechs
    .map((m) => ({
      id: m.id,
      name: profileName.get(m.id) ?? "Mechanic",
      status: (m.status === "on_job" ? "on_job" : "online") as "online" | "on_job",
      area: district(m.base_postcode),
      rating: m.rating != null ? Number(m.rating) : null,
    }))
    // Online (free to take offers) first, then on-job.
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "online" ? -1 : 1));

  // --- Activity feed --------------------------------------------------------
  // Job numbers come from the bookings we just loaded (recent events reference
  // recent bookings); fall back to "—" for anything older than the window.
  const jobNumberById = new Map(bookings.map((b) => [b.id, b.job_number]));
  const activity: ActivityEvent[] = events.map((e) => ({
    id: e.id,
    bookingRef: `#${formatJobNumber(jobNumberById.get(String(e.booking_id)))}`,
    eventType: e.event_type,
    actorRole: e.actor_role,
    payload: (e.payload ?? {}) as Record<string, unknown>,
    createdAt: e.created_at,
  }));

  return (
    <div className="space-y-6">
      <header>
        <Overline>Operations</Overline>
        <h1 className="mt-1 flex items-center gap-2.5 text-3xl font-bold tracking-tight text-text-primary">
          Live monitor
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-semibold text-success">
            <span className="size-1.5 animate-pulse rounded-full bg-success" />
            Live
          </span>
        </h1>
        <p className="mt-1.5 text-sm text-text-muted">
          What&apos;s happening across the marketplace right now — refreshes every
          15 seconds.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI label="Live jobs" value={liveJobs} delta="In progress now" icon={Wrench} />
        <KPI
          label="Awaiting mechanic"
          value={awaitingMechanic}
          delta="Sourcing a mechanic"
          deltaTone={awaitingMechanic > 0 ? "error" : "neutral"}
          icon={Hourglass}
        />
        <KPI label="Open offers" value={openOffers ?? 0} delta="Out to mechanics" icon={Inbox} />
        <KPI
          label="Mechanics online"
          value={onlineCount}
          delta={onJobCount > 0 ? `+${onJobCount} on a job` : "Available now"}
          deltaTone={onlineCount > 0 ? "success" : "error"}
          icon={Users}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <LiveMonitor rows={monitorRows} />
        </div>
        <div>
          <MechanicsOnline mechanics={onlineMechanics} />
        </div>
      </div>

      <ActivityFeed events={activity} />
    </div>
  );
}
