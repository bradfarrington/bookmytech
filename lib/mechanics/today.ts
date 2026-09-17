import { addDaysToKey, dayOfWeekForKey, londonClock, londonDateKey, londonInstant } from "@/lib/slots";
import { haversineMiles, type LatLng } from "@/lib/geo/postcodes";
import { formatPrice } from "@/lib/utils";

// The rules behind the mechanic app's Today screen (Task 66) — pure, so
// today.test.ts can pin them. Loading lives in ./day-summary.ts, the timed
// offline in ./availability.ts.

// --- Leave by ---------------------------------------------------------------
//
// When to set off for a job: the START of its arrival window, minus the drive.
// We have no routing, only straight lines between postcodes, so the drive is
// an estimate on purpose: the straight-line miles at 20 mph — slow enough to
// absorb the road being longer than the line, and town traffic — plus 10
// minutes to load the van and park. Rounded DOWN to five minutes, so the error
// is always on the early side.

export const LEAVE_BY_MPH = 20;
export const LEAVE_BY_BUFFER_MINUTES = 10;
const FIVE_MINUTES_MS = 5 * 60_000;

export function leaveByIso(windowStartIso: string, distanceMiles: number): string {
  const travelMinutes = (distanceMiles / LEAVE_BY_MPH) * 60 + LEAVE_BY_BUFFER_MINUTES;
  const at = new Date(windowStartIso).getTime() - travelMinutes * 60_000;
  // London's offset is a whole number of hours, so flooring the instant floors
  // the wall clock too.
  return new Date(Math.floor(at / FIVE_MINUTES_MS) * FIVE_MINUTES_MS).toISOString();
}

// --- Accept rate ------------------------------------------------------------

export const ACCEPT_RATE_WINDOW_DAYS = 30;

export interface AcceptRate {
  /** Whole number, null when nothing was answered. */
  percent: number | null;
  accepted: number;
  /** accepted + declined. An offer somebody else won, or still live, is neither. */
  answered: number;
  windowDays: number;
}

export function acceptRateOf(accepted: number, declined: number): AcceptRate {
  const answered = accepted + declined;
  return {
    percent: answered === 0 ? null : Math.round((accepted / answered) * 100),
    accepted,
    answered,
    windowDays: ACCEPT_RATE_WINDOW_DAYS,
  };
}

// --- Distance ---------------------------------------------------------------

export function roundMiles(miles: number): number {
  return Math.round(miles * 10) / 10;
}

/**
 * base → stop 1 → stop 2 …, straight lines. Null when the base or any stop is
 * unknown — a total with a leg missing would read as a short day.
 */
export function routeMiles(base: LatLng | null, stops: Array<LatLng | null>): number | null {
  if (stops.length === 0) return 0;
  if (!base) return null;
  let total = 0;
  let from = base;
  for (const stop of stops) {
    if (!stop) return null;
    total += haversineMiles(from, stop);
    from = stop;
  }
  return roundMiles(total);
}

// --- Timed offline ----------------------------------------------------------

/** What `POST /mechanic/status` accepts as `resume`. */
export type ResumeRequest = { minutes: 30 | 60 } | { at: "next_shift" };

export const RESUME_MINUTES = [30, 60] as const;

/** A request body's `resume`, validated. `undefined` = absent; `null` = malformed. */
export function parseResume(raw: unknown): ResumeRequest | undefined | null {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const { minutes, at } = raw as { minutes?: unknown; at?: unknown };
  if (minutes !== undefined && at !== undefined) return null;
  if (minutes === 30 || minutes === 60) return { minutes };
  if (at === "next_shift") return { at };
  return null;
}

/** One `mechanic_availability` row, as far as a shift's start needs it. */
export interface ShiftRow {
  day_of_week: number;
  is_active: boolean;
  /** Postgres `time`, "HH:MM:SS". Null = the day is worked but has no hours saved. */
  start_time: string | null;
}

/** A working day saved without hours starts when the first arrival window does. */
const DEFAULT_SHIFT_START = { hour: 8, minute: 0 };

/**
 * The start of the mechanic's next working day, UK time — today's if it hasn't
 * begun yet, otherwise the next active weekday's, up to the same weekday next
 * week. Null when no day is active.
 */
export function nextShiftStart(rows: ShiftRow[], now: Date = new Date()): Date | null {
  const todayKey = londonDateKey(now);
  for (let i = 0; i <= 7; i++) {
    const key = addDaysToKey(todayKey, i);
    const row = rows.find((r) => r.day_of_week === dayOfWeekForKey(key));
    if (!row?.is_active) continue;
    const [h, m] = row.start_time ? row.start_time.split(":").map(Number) : [];
    const start = Number.isFinite(h)
      ? londonInstant(key, h, Number.isFinite(m) ? m : 0)
      : londonInstant(key, DEFAULT_SHIFT_START.hour, DEFAULT_SHIFT_START.minute);
    if (start.getTime() > now.getTime()) return start;
  }
  return null;
}

// --- Push copy --------------------------------------------------------------

const jobs = (n: number) => `${n} job${n === 1 ? "" : "s"}`;

/** "4 jobs · £340 · first at 08:30 in SE21" */
export function tomorrowPushBody(input: {
  jobCount: number;
  bookedPence: number;
  firstAt: string | null;
  firstArea: string | null;
}): string {
  const parts = [jobs(input.jobCount), formatPrice(input.bookedPence)];
  if (input.firstAt) {
    const where = input.firstArea ? ` in ${input.firstArea}` : "";
    parts.push(`first at ${londonClock(new Date(input.firstAt))}${where}`);
  }
  return parts.join(" · ");
}

/** "You earned £248 today across 4 jobs." */
export function recapPushBody(earnedPence: number, completedJobs: number): string {
  return `You earned ${formatPrice(earnedPence)} today across ${jobs(completedJobs)}.`;
}
