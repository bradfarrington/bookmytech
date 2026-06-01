import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { geocodePostcode, haversineMiles } from "@/lib/geo/postcodes";
import { mechanicSharePence } from "@/lib/earnings";
import { KpiCards, type MechanicKpis } from "./_components/kpi-cards";
import { OfferFeed, type OfferView } from "./_components/offer-feed";

// One-to-one Supabase joins arrive typed as arrays; normalise to a single row.
function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

interface OfferRow {
  id: string;
  offered_at: string;
  booking:
    | {
        id: string;
        vehicle_reg: string | null;
        vehicle_make: string | null;
        vehicle_model: string | null;
        area: string | null;
        postcode: string | null;
        scheduled_at: string | null;
        total_pence: number | null;
        commission_rate: number | null;
        service: { name: string | null } | { name: string | null }[] | null;
      }
    | { id: string }[]
    | null;
}

interface CompletedRow {
  total_pence: number | null;
  commission_rate: number | null;
  completed_at: string | null;
}

interface RespondedOfferRow {
  response: string | null;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Monday-based start of the current week.
function startOfWeek(): Date {
  const d = startOfToday();
  const day = d.getDay(); // 0 = Sun
  const diff = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diff);
  return d;
}

// "Today 12:00" / "Tomorrow 09:00" / "Fri 29 May · 10:00"
function slotLabel(iso: string | null): string {
  if (!iso) return "Time to be confirmed";
  const when = new Date(iso);
  const time = when.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const today = startOfToday();
  const whenDay = new Date(when);
  whenDay.setHours(0, 0, 0, 0);
  const dayDiff = Math.round(
    (whenDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === 1) return `Tomorrow ${time}`;
  const date = when.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `${date} · ${time}`;
}

export default async function MechanicJobsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/mechanic/login");

  const { data: mechanic } = await supabase
    .from("mechanics")
    .select("base_postcode, rating, status")
    .eq("id", user.id)
    .single();

  // --- Live offers (still pending) -----------------------------------------
  const { data: offerRows } = await supabase
    .from("job_offers")
    .select(
      "id, offered_at, booking:bookings(id, vehicle_reg, vehicle_make, vehicle_model, area, postcode, scheduled_at, total_pence, commission_rate, service:services(name))",
    )
    .eq("mechanic_id", user.id)
    .is("response", null)
    .order("offered_at", { ascending: false });

  // Pre-geocode the mechanic's base once for distance labels.
  const baseCoords = await geocodePostcode(mechanic?.base_postcode);

  const offers: OfferView[] = [];
  for (const row of (offerRows ?? []) as unknown as OfferRow[]) {
    const booking = one(row.booking as never);
    if (!booking) continue;
    const service = one((booking as { service: unknown }).service as never) as
      | { name: string | null }
      | null;

    const b = booking as Exclude<OfferRow["booking"], unknown[] | null>;

    let distanceLabel: string | null = null;
    if (baseCoords && b.postcode) {
      const jobCoords = await geocodePostcode(b.postcode);
      if (jobCoords) {
        distanceLabel = `${haversineMiles(baseCoords, jobCoords).toFixed(1)} mi`;
      }
    }

    const earnings = mechanicSharePence(
      b.total_pence ?? 0,
      b.commission_rate ?? 0.15,
    );

    offers.push({
      id: row.id,
      bookingId: b.id,
      offeredAt: row.offered_at,
      serviceName: service?.name ?? "Service",
      vehicle: [b.vehicle_make, b.vehicle_model].filter(Boolean).join(" ") || "Vehicle",
      reg: b.vehicle_reg ?? "",
      area: b.area ?? b.postcode ?? "—",
      distanceLabel,
      slot: slotLabel(b.scheduled_at),
      earningsPence: earnings,
    });
  }

  // --- KPIs -----------------------------------------------------------------
  const { data: completed } = await supabase
    .from("bookings")
    .select("total_pence, commission_rate, completed_at")
    .eq("mechanic_id", user.id)
    .eq("status", "completed");

  const todayStart = startOfToday().getTime();
  const weekStart = startOfWeek().getTime();
  let todayEarningsPence = 0;
  let jobsThisWeek = 0;
  for (const c of (completed ?? []) as CompletedRow[]) {
    if (!c.completed_at) continue;
    const t = new Date(c.completed_at).getTime();
    const share = mechanicSharePence(c.total_pence ?? 0, c.commission_rate ?? 0.15);
    if (t >= todayStart) todayEarningsPence += share;
    if (t >= weekStart) jobsThisWeek += 1;
  }

  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: responded } = await supabase
    .from("job_offers")
    .select("response")
    .eq("mechanic_id", user.id)
    .not("response", "is", null)
    .gte("responded_at", thirtyDaysAgo);

  let accepted = 0;
  let declined = 0;
  for (const r of (responded ?? []) as RespondedOfferRow[]) {
    if (r.response === "accepted") accepted += 1;
    else if (r.response === "declined") declined += 1;
  }
  const decisions = accepted + declined;
  const acceptanceRate = decisions > 0 ? Math.round((accepted / decisions) * 100) : null;

  const kpis: MechanicKpis = {
    todayEarningsPence,
    jobsThisWeek,
    acceptanceRate,
    rating: mechanic?.rating ?? null,
  };

  return (
    <div className="space-y-6">
      <KpiCards kpis={kpis} />
      <OfferFeed mechanicId={user.id} offers={offers} />
    </div>
  );
}
