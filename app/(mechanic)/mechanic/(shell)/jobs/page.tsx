import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { geocodePostcode, haversineMiles, type LatLng } from "@/lib/geo/postcodes";
import { mechanicSharePence } from "@/lib/earnings";
import { formatPrice } from "@/lib/utils";
import { KpiCards, type MechanicKpis } from "./_components/kpi-cards";
import { OfferFeed, type OfferView } from "./_components/offer-feed";
import { Schedule, type ScheduleItem } from "./_components/schedule";
import { AreaMap, type AreaPin } from "./_components/area-map";

// One-to-one Supabase joins arrive typed as arrays; normalise to a single row.
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

interface OfferRow {
  id: string;
  offered_at: string;
  booking: unknown;
}

interface BookingJoin {
  id: string;
  vehicle_reg: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  area: string | null;
  postcode: string | null;
  scheduled_at: string | null;
  total_pence: number | null;
  commission_rate: number | null;
  service: unknown;
}

interface ScheduleRow {
  id: string;
  scheduled_at: string | null;
  status: string;
  postcode: string | null;
  area: string | null;
  total_pence: number | null;
  commission_rate: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  service: unknown;
}

interface CompletedRow {
  total_pence: number | null;
  commission_rate: number | null;
  completed_at: string | null;
}

const UPCOMING_STATUSES = ["confirmed", "en_route", "in_progress"];

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeek(): Date {
  const d = startOfToday();
  const diff = (d.getDay() + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  return d;
}

function serviceName(service: unknown): string {
  const s = one(service as never) as { name?: string | null } | null;
  return s?.name ?? "Service";
}

function slotLabel(iso: string | null): string {
  if (!iso) return "Time to be confirmed";
  const when = new Date(iso);
  const time = when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const today = startOfToday();
  const whenDay = new Date(when);
  whenDay.setHours(0, 0, 0, 0);
  const dayDiff = Math.round((whenDay.getTime() - today.getTime()) / 86_400_000);
  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === 1) return `Tomorrow ${time}`;
  return `${when.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · ${time}`;
}

export default async function MechanicJobsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/mechanic/login");

  const { data: mechanic } = await supabase
    .from("mechanics")
    .select("base_postcode, service_radius_miles, rating")
    .eq("id", user.id)
    .single();

  const baseCoords: LatLng | null = await geocodePostcode(mechanic?.base_postcode);
  const radiusMiles = mechanic?.service_radius_miles ?? 10;

  // --- Live offers ----------------------------------------------------------
  const { data: offerRows } = await supabase
    .from("job_offers")
    .select(
      "id, offered_at, booking:bookings(id, vehicle_reg, vehicle_make, vehicle_model, area, postcode, scheduled_at, total_pence, commission_rate, service:services(name))",
    )
    .eq("mechanic_id", user.id)
    .is("response", null)
    .order("offered_at", { ascending: false });

  const offers: OfferView[] = [];
  for (const row of (offerRows ?? []) as unknown as OfferRow[]) {
    const b = one(row.booking as never) as BookingJoin | null;
    if (!b) continue;

    let distanceLabel: string | null = null;
    if (baseCoords && b.postcode) {
      const jobCoords = await geocodePostcode(b.postcode);
      if (jobCoords) distanceLabel = `${haversineMiles(baseCoords, jobCoords).toFixed(1)} mi`;
    }

    offers.push({
      id: row.id,
      bookingId: b.id,
      offeredAt: row.offered_at,
      serviceName: serviceName(b.service),
      vehicle: [b.vehicle_make, b.vehicle_model].filter(Boolean).join(" ") || "Vehicle",
      reg: b.vehicle_reg ?? "",
      area: b.area ?? b.postcode ?? "—",
      distanceLabel,
      slot: slotLabel(b.scheduled_at),
      earningsPence: mechanicSharePence(b.total_pence ?? 0, b.commission_rate ?? 0.15),
    });
  }

  // --- Today's schedule + upcoming jobs (for the map pins) ------------------
  const { data: bookingRows } = await supabase
    .from("bookings")
    .select(
      "id, scheduled_at, status, postcode, area, total_pence, commission_rate, vehicle_make, vehicle_model, service:services(name)",
    )
    .eq("mechanic_id", user.id)
    .gte("scheduled_at", startOfToday().toISOString())
    .in("status", ["confirmed", "en_route", "in_progress", "completed"])
    .order("scheduled_at", { ascending: true })
    .limit(50);

  const todayStartMs = startOfToday().getTime();
  const tomorrowStartMs = todayStartMs + 86_400_000;

  const scheduleItems: ScheduleItem[] = [];
  const pins: AreaPin[] = [];
  let nextAssigned = true; // first upcoming item is "next up"

  for (const b of (bookingRows ?? []) as ScheduleRow[]) {
    const whenMs = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
    const title = `${serviceName(b.service)} · ${[b.vehicle_make, b.vehicle_model].filter(Boolean).join(" ") || "Vehicle"}`;
    const status = b.status as ScheduleItem["status"];

    if (whenMs >= todayStartMs && whenMs < tomorrowStartMs) {
      const isUpcoming = UPCOMING_STATUSES.includes(status);
      const isNext = isUpcoming && nextAssigned;
      if (isNext) nextAssigned = false;
      scheduleItems.push({
        bookingId: b.id,
        time: b.scheduled_at
          ? new Date(b.scheduled_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
          : "—",
        title,
        where: b.area ?? b.postcode ?? "—",
        earnings: formatPrice(mechanicSharePence(b.total_pence ?? 0, b.commission_rate ?? 0.15)),
        status,
        isNext,
      });
    }

    // Map pins: upcoming (not completed) jobs anywhere from today forward.
    if (baseCoords && UPCOMING_STATUSES.includes(status) && b.postcode) {
      const coords = await geocodePostcode(b.postcode);
      if (coords) {
        pins.push({ id: b.id, lat: coords.lat, lng: coords.lng, label: title });
      }
    }
  }

  // --- KPIs -----------------------------------------------------------------
  const { data: completed } = await supabase
    .from("bookings")
    .select("total_pence, commission_rate, completed_at")
    .eq("mechanic_id", user.id)
    .eq("status", "completed");

  const weekStartMs = startOfWeek().getTime();
  let todayEarningsPence = 0;
  let jobsThisWeek = 0;
  for (const c of (completed ?? []) as CompletedRow[]) {
    if (!c.completed_at) continue;
    const t = new Date(c.completed_at).getTime();
    if (t >= todayStartMs) {
      todayEarningsPence += mechanicSharePence(c.total_pence ?? 0, c.commission_rate ?? 0.15);
    }
    if (t >= weekStartMs) jobsThisWeek += 1;
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: responded } = await supabase
    .from("job_offers")
    .select("response")
    .eq("mechanic_id", user.id)
    .not("response", "is", null)
    .gte("responded_at", thirtyDaysAgo);

  let accepted = 0;
  let declined = 0;
  for (const r of (responded ?? []) as { response: string | null }[]) {
    if (r.response === "accepted") accepted += 1;
    else if (r.response === "declined") declined += 1;
  }
  const decisions = accepted + declined;

  const kpis: MechanicKpis = {
    todayEarningsPence,
    jobsThisWeek,
    acceptanceRate: decisions > 0 ? Math.round((accepted / decisions) * 100) : null,
    rating: mechanic?.rating ?? null,
  };

  return (
    <div className="space-y-6">
      <KpiCards kpis={kpis} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <OfferFeed mechanicId={user.id} offers={offers} />
          <Schedule items={scheduleItems} />
        </div>
        <div className="lg:col-span-1">
          <AreaMap
            basePostcode={mechanic?.base_postcode ?? null}
            baseCoords={baseCoords}
            radiusMiles={radiusMiles}
            pins={pins}
            jobsInArea={pins.length}
          />
        </div>
      </div>
    </div>
  );
}
