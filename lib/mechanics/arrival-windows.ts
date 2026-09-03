import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ALL_DAY_SLOT,
  BOOKING_TIME_ZONE,
  TWO_HOUR_SLOTS,
  TWO_HOUR_SLOT_HOURS,
  addDaysToKey,
  dayOfWeekForKey,
  isSlotBookable,
  londonDateKey,
  londonInstant,
  slotIso,
} from "@/lib/slots";
import { formatJobNumber } from "@/lib/utils";

// The six 2-hour windows a mechanic can narrow an ALL-DAY booking down to,
// annotated with what their own calendar says about each one (Task 21).
//
// `buildArrivalWindowOptions` is pure — it works over rows the caller has
// already fetched, so it is unit-tested without a database and the two callers
// (the job-detail page and the `setArrivalWindow` action) cannot disagree.
// `loadArrivalWindowOptions` is the thin loader in front of it, and accepts
// either the mechanic's RLS client (the page) or the service-role client (the
// action): `mechanic_availability` and their own `bookings` are both own-row
// readable under RLS (0010, 0008).
//
// Two kinds of annotation, deliberately different in strength (owner decision
// 2026-09-03):
//   • a CLASH with another timed job that day is a hard block — the picker
//     greys it out and the action refuses it;
//   • being OUTSIDE the mechanic's saved weekly hours is advisory only — the
//     mechanic already accepted the job, so their hours are a hint, not a rule.
//
// Every instant here is built through lib/slots.ts' London helpers so a DST
// switch day, or the server being on UTC, never shifts a window.

/** Statuses under which another job of the mechanic's occupies its window. */
export const OCCUPYING_STATUSES = ["confirmed", "en_route", "in_progress"] as const;

/** One `mechanic_availability` row (a weekday's saved hours). */
export interface AvailabilityRow {
  is_active: boolean;
  /** Postgres `time` — "HH:MM:SS" — or null when the day was saved without hours. */
  start_time: string | null;
  end_time: string | null;
}

/** Another booking of the same mechanic, on the same UK calendar day. */
export interface SiblingBooking {
  id: string;
  job_number: number | null;
  scheduled_at: string | null;
  slot_window: string | null;
  /** Postgres `numeric` arrives as a string through PostgREST. */
  service_duration_hours: number | string | null;
  status: string;
}

export interface ArrivalWindowClash {
  bookingId: string;
  /** "00123" — formatted for display, prefix with "#" in markup. */
  jobNumber: string;
  /** The clashing job's own window, or its exact start time for a legacy row. */
  window: string;
}

export interface ArrivalWindowOption {
  /** "10am–12pm" — the label that becomes `bookings.slot_window`. */
  window: string;
  startHour: number;
  /** The window's start instant — becomes `bookings.scheduled_at`. */
  iso: string;
  /** Start is still at least MIN_LEAD_MINUTES away (lib/slots.ts). */
  bookable: boolean;
  /** Any part of the window falls outside the mechanic's saved hours. Advisory. */
  outsideHours: boolean;
  /** Overlaps another timed job of theirs that day. Hard block. */
  clash: ArrivalWindowClash | null;
  /** bookable && no clash — what the picker enables and the action accepts. */
  selectable: boolean;
}

export interface ArrivalWindowOptions {
  /** "YYYY-MM-DD" UK calendar day of the booking. */
  dayKey: string;
  /** Always the six 2-hour windows, in TWO_HOUR_SLOTS order. */
  options: ArrivalWindowOption[];
  /** The saved hours for that weekday ("08:00"–"18:00"), or null when none are saved. */
  hours: { start: string; end: string } | null;
  /** The weekday is switched off in their availability. */
  dayOff: boolean;
  /** Their OTHER un-narrowed all-day jobs that day — worth knowing, never a clash. */
  allDayJobs: Array<{ bookingId: string; jobNumber: string }>;
  anySelectable: boolean;
}

/** "HH:MM[:SS]" → minutes since midnight, or null when unparseable. */
function timeToMinutes(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(value);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** "HH:MM:SS" → "HH:MM" for display. */
function timeLabel(value: string): string {
  return value.slice(0, 5);
}

/** How long a timed job occupies, in hours: at least its 2-hour window. */
function occupiedHours(duration: number | string | null): number {
  const n = Number(duration);
  const hours = Number.isFinite(n) && n > 0 ? n : 1;
  return Math.max(TWO_HOUR_SLOT_HOURS, hours);
}

function exactTimeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BOOKING_TIME_ZONE,
  });
}

export function buildArrivalWindowOptions(input: {
  dayKey: string;
  availability: AvailabilityRow | null;
  siblings: SiblingBooking[];
  now?: Date;
}): ArrivalWindowOptions {
  const { dayKey, availability, siblings } = input;
  const now = input.now ?? new Date();

  // --- Hours ----------------------------------------------------------------
  // No row → unknown, which is not the same as "off": nothing is flagged.
  // A row switched off → every window is outside their hours.
  const dayOff = availability != null && !availability.is_active;
  const startMin = availability?.is_active ? timeToMinutes(availability.start_time) : null;
  const endMin = availability?.is_active ? timeToMinutes(availability.end_time) : null;
  const hours =
    availability?.is_active && availability.start_time && availability.end_time
      ? { start: timeLabel(availability.start_time), end: timeLabel(availability.end_time) }
      : null;

  // --- Other jobs that day --------------------------------------------------
  const allDayJobs: ArrivalWindowOptions["allDayJobs"] = [];
  const timed: Array<{ start: number; end: number; clash: ArrivalWindowClash }> = [];
  const occupying = [...siblings]
    .filter(
      (s) =>
        s.scheduled_at != null &&
        (OCCUPYING_STATUSES as readonly string[]).includes(s.status),
    )
    .sort((a, b) => (a.scheduled_at! < b.scheduled_at! ? -1 : a.scheduled_at! > b.scheduled_at! ? 1 : 0));

  for (const s of occupying) {
    const jobNumber = formatJobNumber(s.job_number);
    if (s.slot_window === ALL_DAY_SLOT.window) {
      allDayJobs.push({ bookingId: s.id, jobNumber });
      continue;
    }
    const start = new Date(s.scheduled_at!).getTime();
    timed.push({
      start,
      end: start + occupiedHours(s.service_duration_hours) * 3_600_000,
      clash: {
        bookingId: s.id,
        jobNumber,
        window: s.slot_window ?? exactTimeLabel(s.scheduled_at!),
      },
    });
  }

  // --- The six windows ------------------------------------------------------
  const options: ArrivalWindowOption[] = TWO_HOUR_SLOTS.map((slot) => {
    const slotStart = londonInstant(dayKey, slot.startHour).getTime();
    const slotEnd = londonInstant(dayKey, slot.startHour + TWO_HOUR_SLOT_HOURS).getTime();

    const clash = timed.find((t) => slotStart < t.end && t.start < slotEnd)?.clash ?? null;
    const bookable = isSlotBookable(dayKey, slot, now);

    // Wall-clock comparison against the saved hours — the hours are wall-clock
    // too, so instants would be the wrong currency here.
    const windowStartMin = slot.startHour * 60;
    const windowEndMin = (slot.startHour + TWO_HOUR_SLOT_HOURS) * 60;
    const outsideHours =
      dayOff ||
      (startMin != null && windowStartMin < startMin) ||
      (endMin != null && windowEndMin > endMin);

    return {
      window: slot.window,
      startHour: slot.startHour,
      iso: slotIso(dayKey, slot.startHour),
      bookable,
      outsideHours,
      clash,
      selectable: bookable && clash == null,
    };
  });

  return {
    dayKey,
    options,
    hours,
    dayOff,
    allDayJobs,
    anySelectable: options.some((o) => o.selectable),
  };
}

/**
 * Fetch the mechanic's saved hours for the booking's weekday and their other
 * jobs on that UK calendar day, then build the options.
 */
export async function loadArrivalWindowOptions(
  db: SupabaseClient,
  mechanicId: string,
  booking: { id: string; scheduled_at: string },
  now: Date = new Date(),
): Promise<ArrivalWindowOptions> {
  const dayKey = londonDateKey(new Date(booking.scheduled_at));
  const dayStart = londonInstant(dayKey, 0).toISOString();
  const dayEnd = londonInstant(addDaysToKey(dayKey, 1), 0).toISOString();

  const [{ data: availability }, { data: siblings }] = await Promise.all([
    db
      .from("mechanic_availability")
      .select("is_active, start_time, end_time")
      .eq("mechanic_id", mechanicId)
      .eq("day_of_week", dayOfWeekForKey(dayKey))
      .maybeSingle(),
    db
      .from("bookings")
      .select("id, job_number, scheduled_at, slot_window, service_duration_hours, status")
      .eq("mechanic_id", mechanicId)
      .neq("id", booking.id)
      .in("status", [...OCCUPYING_STATUSES])
      .gte("scheduled_at", dayStart)
      .lt("scheduled_at", dayEnd),
  ]);

  return buildArrivalWindowOptions({
    dayKey,
    availability: (availability as AvailabilityRow | null) ?? null,
    siblings: (siblings ?? []) as SiblingBooking[],
    now,
  });
}
