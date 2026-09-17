import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { mechanicSharePence } from "@/lib/earnings";
import { geocodePostcode, haversineMiles, outwardCode, type LatLng } from "@/lib/geo/postcodes";
import { OCCUPYING_STATUSES } from "@/lib/mechanics/arrival-windows";
import {
  ACCEPT_RATE_WINDOW_DAYS,
  acceptRateOf,
  leaveByIso,
  roundMiles,
  routeMiles,
  type AcceptRate,
} from "@/lib/mechanics/today";
import { addDaysToKey, londonDateKey, londonInstant } from "@/lib/slots";

// One London day of a mechanic's work, for the mechanic app's Today, Tomorrow
// and End-of-day screens (GET /api/mobile/v1/mechanic/summary) and for the two
// pushes that open them (lib/mechanics/daily-pushes.ts).
//
// The app reads its own bookings under RLS and could add most of this up
// itself. What it cannot do is turn postcodes into distances — so the
// distances, the leave-by time built on them, and the totals that belong on the
// same screen come from here, and the app never has to agree with us about
// which jobs count.
//
// A job belongs to the day its `scheduled_at` falls on, UK time. Same distance
// helper and rounding as the offer cards (lib/mechanics/offer-summaries.ts).

export interface DaySummary {
  dayKey: string;
  /** The mechanic's jobs that day, any status but cancelled, in scheduled order. */
  jobs: Array<{ bookingId: string; distanceMiles: number | null }>;
  /**
   * When to set off for the first job still to do, and its postcode district.
   * The rule is `leaveByIso` in lib/mechanics/today.ts. Null when there is no
   * open job or either end won't geocode.
   */
  leaveBy: { iso: string; area: string | null } | null;
  acceptRate: AcceptRate;
  totals: {
    /** Take-home over the day's COMPLETED jobs. */
    earnedPence: number;
    /** Take-home over every job in `jobs`. */
    bookedPence: number;
    completedJobs: number;
    /** Sum of completed_at − started_at. */
    workedMinutes: number;
    /** base → job 1 → job 2 … in scheduled order; null if any leg won't geocode. */
    distanceMiles: number | null;
  };
}

interface DayBooking {
  id: string;
  status: string;
  postcode: string | null;
  area: string | null;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  total_pence: number | null;
  commission_rate: number | null;
  mechanic_payout_pence: number | null;
}

const DAY_COLUMNS =
  "id, status, postcode, area, scheduled_at, started_at, completed_at, total_pence, commission_rate, mechanic_payout_pence";

type Admin = ReturnType<typeof createAdminClient>;

/** The mechanic's non-cancelled jobs scheduled on a London day, in order. */
export async function mechanicJobsOn(admin: Admin, mechanicId: string, dayKey: string): Promise<DayBooking[]> {
  const { data, error } = await admin
    .from("bookings")
    .select(DAY_COLUMNS)
    .eq("mechanic_id", mechanicId)
    .neq("status", "cancelled")
    .gte("scheduled_at", londonInstant(dayKey, 0).toISOString())
    .lt("scheduled_at", londonInstant(addDaysToKey(dayKey, 1), 0).toISOString())
    .order("scheduled_at")
    .order("id");
  if (error) throw error;
  return (data ?? []) as DayBooking[];
}

/** The snapshotted take-home; a booking from before the snapshot works it out. */
export function payoutOf(b: Pick<DayBooking, "mechanic_payout_pence" | "total_pence" | "commission_rate">): number {
  return b.mechanic_payout_pence ?? mechanicSharePence(b.total_pence ?? 0, b.commission_rate ?? 0.15);
}

export function isOpenJob(status: string): boolean {
  return (OCCUPYING_STATUSES as readonly string[]).includes(status);
}

/** Earnings figures for a day's jobs — shared by the summary and both pushes. */
export function dayMoney(jobs: DayBooking[]) {
  const completed = jobs.filter((j) => j.status === "completed");
  return {
    earnedPence: completed.reduce((sum, j) => sum + payoutOf(j), 0),
    bookedPence: jobs.reduce((sum, j) => sum + payoutOf(j), 0),
    completedJobs: completed.length,
  };
}

export function areaOf(b: Pick<DayBooking, "postcode" | "area">): string | null {
  return outwardCode(b.postcode ?? "") || b.area || null;
}

async function acceptRateFor(admin: Admin, mechanicId: string, now: Date): Promise<AcceptRate> {
  const since = new Date(now.getTime() - ACCEPT_RATE_WINDOW_DAYS * 86_400_000).toISOString();
  const count = async (response: "accepted" | "declined") => {
    const { count: n, error } = await admin
      .from("job_offers")
      .select("id", { count: "exact", head: true })
      .eq("mechanic_id", mechanicId)
      .eq("response", response)
      .gte("offered_at", since);
    if (error) throw error;
    return n ?? 0;
  };
  const [accepted, declined] = await Promise.all([count("accepted"), count("declined")]);
  return acceptRateOf(accepted, declined);
}

export async function daySummaryFor(
  mechanicId: string,
  dayKey: string = londonDateKey(new Date()),
  now: Date = new Date(),
): Promise<DaySummary> {
  const admin = createAdminClient();

  const [jobs, acceptRate, { data: mechanic }] = await Promise.all([
    mechanicJobsOn(admin, mechanicId, dayKey),
    acceptRateFor(admin, mechanicId, now),
    admin.from("mechanics").select("base_postcode").eq("id", mechanicId).maybeSingle(),
  ]);

  const base = mechanic?.base_postcode ? await geocodePostcode(mechanic.base_postcode) : null;
  const coords: Array<LatLng | null> = await Promise.all(
    jobs.map((j) => (j.postcode ? geocodePostcode(j.postcode) : null)),
  );
  const fromBase = (i: number) => (base && coords[i] ? haversineMiles(base, coords[i]!) : null);

  const firstOpen = jobs.findIndex((j) => isOpenJob(j.status));
  const firstOpenMiles = firstOpen === -1 ? null : fromBase(firstOpen);

  const workedMs = jobs.reduce((sum, j) => {
    if (j.status !== "completed" || !j.started_at || !j.completed_at) return sum;
    return sum + Math.max(0, new Date(j.completed_at).getTime() - new Date(j.started_at).getTime());
  }, 0);

  return {
    dayKey,
    jobs: jobs.map((j, i) => {
      const miles = fromBase(i);
      return { bookingId: j.id, distanceMiles: miles === null ? null : roundMiles(miles) };
    }),
    leaveBy:
      firstOpenMiles === null
        ? null
        : { iso: leaveByIso(jobs[firstOpen].scheduled_at, firstOpenMiles), area: areaOf(jobs[firstOpen]) },
    acceptRate,
    totals: {
      ...dayMoney(jobs),
      workedMinutes: Math.round(workedMs / 60_000),
      distanceMiles: routeMiles(base, coords),
    },
  };
}
