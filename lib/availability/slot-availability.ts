import "server-only";

import { coversJob, isSuspendedNow, type CoverageMechanic } from "@/lib/dispatch/eligibility";
import { geocodePostcode, outwardCode } from "@/lib/geo/postcodes";
import {
  OCCUPYING_STATUSES,
  siblingDayKeys,
  type AvailabilityRow,
  type SiblingBooking,
} from "@/lib/mechanics/arrival-windows";
import { addDaysToKey, dayOfWeekForKey, isDayKey, londonDateKey, londonInstant } from "@/lib/slots";
import { createAdminClient } from "@/lib/supabase/admin";
import { countMechanicsPerWindow, type WindowCount } from "./window-counts";

// Mechanics free per arrival window on one day, near one postcode (Task 54).
// Serves GET /api/mobile/v1/slots and the website's Time step.
//
// Who counts: approved, not suspended, and (when a postcode is known) covering
// it, by the same rule dispatch uses (lib/dispatch/eligibility.ts). Online
// status is ignored: it describes right now, not the day being booked. Without
// a postcode the count is across every mechanic, and `areaChecked` says so.
//
// Service role: `mechanic_availability` and other customers' bookings are not
// readable by a customer. Nothing but the counts leaves this function.

/** How far ahead a day may be asked about. The Time step offers a week. */
export const AVAILABILITY_DAYS_AHEAD = 30;

export type SlotAvailabilityResult =
  | { ok: true; day: string; areaChecked: boolean; windows: WindowCount[] }
  /** `invalid`: the question was wrong (a bad day); otherwise we couldn't answer it. */
  | { ok: false; error: string; invalid: boolean };

interface MechanicRow extends CoverageMechanic {
  id: string;
}

type AvailabilityWithMechanic = AvailabilityRow & { mechanic_id: string };
type SiblingWithMechanic = SiblingBooking & { mechanic_id: string };

export async function slotAvailabilityFor(
  day: string,
  postcode: string | null,
  now: Date = new Date(),
): Promise<SlotAvailabilityResult> {
  if (!isDayKey(day)) return { ok: false, error: "Choose a day to see who's free.", invalid: true };
  const today = londonDateKey(now);
  if (day < today || day > addDaysToKey(today, AVAILABILITY_DAYS_AHEAD)) {
    return { ok: false, error: "Choose a day in the next few weeks.", invalid: true };
  }

  const admin = createAdminClient();
  const { data: mechanicRows, error } = await admin
    .from("mechanics")
    .select("id, base_postcode, service_radius_miles, is_suspended, suspended_until")
    .not("approved_at", "is", null);
  if (error) {
    console.error("[slots] mechanics read failed", error.message);
    return { ok: false, error: "We couldn't check who's free just now. Please try again.", invalid: false };
  }

  const nowMs = now.getTime();
  let pool = ((mechanicRows ?? []) as MechanicRow[]).filter(
    (m) => m.base_postcode && !isSuspendedNow(m, nowMs),
  );

  const area = postcode?.trim() ? postcode.trim().toUpperCase() : null;
  if (area) {
    const job = { coords: await geocodePostcode(area), area: outwardCode(area) };
    const covered = await Promise.all(pool.map(async (m) => ((await coversJob(m, job)).inRange ? m : null)));
    pool = covered.filter((m): m is MechanicRow => m !== null);
  }

  const ids = pool.map((m) => m.id);
  if (ids.length === 0) {
    return { ok: true, day, areaChecked: !!area, windows: countMechanicsPerWindow(day, [], now) };
  }

  const dayStart = londonInstant(day, 0).toISOString();
  const dayEnd = londonInstant(addDaysToKey(day, 1), 0).toISOString();
  const columns =
    "id, mechanic_id, job_number, scheduled_at, slot_window, service_duration_hours, status, candidate_days";

  const [availability, timed, flexible] = await Promise.all([
    admin
      .from("mechanic_availability")
      .select("mechanic_id, is_active, start_time, end_time")
      .in("mechanic_id", ids)
      .eq("day_of_week", dayOfWeekForKey(day)),
    admin
      .from("bookings")
      .select(columns)
      .in("mechanic_id", ids)
      .in("status", [...OCCUPYING_STATUSES])
      .gte("scheduled_at", dayStart)
      .lt("scheduled_at", dayEnd),
    // A still-flexible job (Task 28) is on every day it offers, not just its first.
    admin
      .from("bookings")
      .select(columns)
      .in("mechanic_id", ids)
      .in("status", [...OCCUPYING_STATUSES])
      .overlaps("candidate_days", [day]),
  ]);
  if (availability.error || timed.error) {
    console.error("[slots] calendar read failed", availability.error?.message ?? timed.error?.message);
    return { ok: false, error: "We couldn't check who's free just now. Please try again.", invalid: false };
  }

  const hours = new Map<string, AvailabilityRow>();
  for (const row of (availability.data ?? []) as AvailabilityWithMechanic[]) {
    hours.set(row.mechanic_id, row);
  }

  const siblings = new Map<string, Map<string, SiblingBooking>>();
  for (const row of [
    ...((timed.data ?? []) as unknown as SiblingWithMechanic[]),
    ...((flexible.data ?? []) as unknown as SiblingWithMechanic[]),
  ]) {
    if (!siblingDayKeys(row).includes(day)) continue;
    const forMechanic = siblings.get(row.mechanic_id) ?? new Map<string, SiblingBooking>();
    forMechanic.set(row.id, row);
    siblings.set(row.mechanic_id, forMechanic);
  }

  const windows = countMechanicsPerWindow(
    day,
    ids.map((mechanicId) => ({
      mechanicId,
      availability: hours.get(mechanicId) ?? null,
      siblings: [...(siblings.get(mechanicId)?.values() ?? [])],
    })),
    now,
  );

  return { ok: true, day, areaChecked: !!area, windows };
}
