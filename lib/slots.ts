// Booking arrival windows for the customer booking flow.
//
// The booking stores two things: `scheduled_at` (the window START, used for
// ordering and day-grouping) and `slot_window` (the human window the customer
// picked, persisted and shown to both customer and mechanic). A 2-hour window
// and the all-day window can share a start time, so `slot_window` is what
// distinguishes them downstream.
//
// Every wall-clock time here is UK time (Europe/London — GMT in winter, BST in
// summer). "8am" means 8am where the mechanic turns up, whatever the customer's
// device or the server (Vercel runs on UTC) thinks the local zone is. Instants
// are built and formatted through `Intl` with an explicit time zone, never
// through `setHours`/`toLocale*` defaults.

export const BOOKING_TIME_ZONE = "Europe/London";

/**
 * How far ahead a window's start must be for it to be offered. A customer at
 * 1:55pm shouldn't be able to book "2pm–4pm" — no mechanic can be sourced and
 * on the drive in five minutes.
 */
export const MIN_LEAD_MINUTES = 60;

export interface BookingSlotOption {
  /** Persisted + displayed window text, e.g. "8am–10am" or "All day (8am–8pm)". */
  window: string;
  /** Hour of day (UK time) the window starts — becomes `scheduled_at`. */
  startHour: number;
}

/** The six 2-hour arrival windows, 8am → 8pm. */
export const TWO_HOUR_SLOTS: readonly BookingSlotOption[] = [
  { window: "8am–10am", startHour: 8 },
  { window: "10am–12pm", startHour: 10 },
  { window: "12pm–2pm", startHour: 12 },
  { window: "2pm–4pm", startHour: 14 },
  { window: "4pm–6pm", startHour: 16 },
  { window: "6pm–8pm", startHour: 18 },
];

/** The single all-day option (8am–8pm), rendered full-width in the picker. */
export const ALL_DAY_SLOT: BookingSlotOption = {
  window: "All day (8am–8pm)",
  startHour: 8,
};

// --- UK calendar days -------------------------------------------------------
//
// A "day" in the picker is a UK calendar date, carried as a "YYYY-MM-DD" key.
// Keys are plain calendar arithmetic (no zone), and only become instants via
// `londonInstant`, so a day never shifts because of the device's zone or DST.

/** "YYYY-MM-DD" for the UK calendar date an instant falls on. */
export function londonDateKey(at: Date): string {
  const p = londonParts(at);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** The key `n` calendar days after `key` (negative `n` goes back). */
export function addDaysToKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + n));
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

/** Whole calendar days from `fromKey` to `toKey` (negative when `toKey` is earlier). */
export function daysBetweenKeys(fromKey: string, toKey: string): number {
  return Math.round((keyToUtcMidnight(toKey) - keyToUtcMidnight(fromKey)) / 86_400_000);
}

/**
 * The instant at `hour`:00 UK time on the given UK calendar day. Handles the
 * GMT↔BST switch by resolving the zone offset at the target itself.
 */
export function londonInstant(key: string, hour: number): Date {
  const [y, m, d] = key.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, hour, 0, 0, 0);
  // First guess: treat the wall time as UTC, ask what London's offset is then,
  // and pull back by it. Around a DST change the offset at the guess and at
  // the answer can differ, so resolve once more from the answer.
  let instant = wall - londonOffsetMs(new Date(wall));
  const settled = wall - londonOffsetMs(new Date(instant));
  if (settled !== instant) instant = settled;
  return new Date(instant);
}

/** ISO string for the start of a window on a UK calendar day. */
export function slotIso(key: string, startHour: number): string {
  return londonInstant(key, startHour).toISOString();
}

/**
 * Whether a window can still be offered: its start must be at least
 * MIN_LEAD_MINUTES away. A window whose start has passed is never bookable —
 * "8am–10am" at 9am would put `scheduled_at` in the past.
 */
export function isSlotBookable(
  key: string,
  slot: BookingSlotOption,
  now: Date = new Date(),
): boolean {
  const start = londonInstant(key, slot.startHour).getTime();
  return start - now.getTime() >= MIN_LEAD_MINUTES * 60_000;
}

/** Whether any window (2-hour or all-day) is still bookable on a day. */
export function dayHasBookableSlot(key: string, now: Date = new Date()): boolean {
  return (
    TWO_HOUR_SLOTS.some((s) => isSlotBookable(key, s, now)) ||
    isSlotBookable(key, ALL_DAY_SLOT, now)
  );
}

/** The next `count` UK calendar days starting today, as keys. */
export function upcomingDayKeys(now: Date = new Date(), count = 7): string[] {
  const today = londonDateKey(now);
  return Array.from({ length: count }, (_, i) => addDaysToKey(today, i));
}

/** Day-chip labels for a key: { weekday: "Thu" | "Today" | "Tmrw", dayOfMonth: "27" }. */
export function dayChipLabel(
  key: string,
  now: Date = new Date(),
): { weekday: string; dayOfMonth: string } {
  const offset = daysBetweenKeys(londonDateKey(now), key);
  const noon = londonInstant(key, 12);
  const weekday =
    offset === 0
      ? "Today"
      : offset === 1
        ? "Tmrw"
        : noon.toLocaleDateString("en-GB", { weekday: "short", timeZone: BOOKING_TIME_ZONE });
  return { weekday, dayOfMonth: String(Number(key.slice(8, 10))) };
}

// --- Display ----------------------------------------------------------------

/** "Wed 3 Jul" — the calendar-day portion of a slot label. */
function dayPart(when: Date): string {
  return when.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: BOOKING_TIME_ZONE,
  });
}

/**
 * Human slot label combining the booking day with the chosen arrival window,
 * e.g. "Wed 3 Jul · 8am–10am". Falls back to the exact start time when no
 * window is stored (legacy bookings, or a specific rescheduled time).
 *
 * Pass `{ relative: true }` for the mechanic day views to get Today/Tomorrow
 * prefixes instead of the weekday.
 */
export function formatBookingSlot(
  iso: string | null,
  window?: string | null,
  opts: { relative?: boolean; now?: Date } = {},
): string {
  if (!iso) return "Time to be confirmed";
  const when = new Date(iso);

  let day: string;
  if (opts.relative) {
    const diff = daysBetweenKeys(londonDateKey(opts.now ?? new Date()), londonDateKey(when));
    day = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : dayPart(when);
  } else {
    day = dayPart(when);
  }

  const timePart =
    window ??
    when.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: BOOKING_TIME_ZONE,
    });
  return `${day} · ${timePart}`;
}

// --- Internals --------------------------------------------------------------

const PARTS_FORMAT = new Intl.DateTimeFormat("en-GB", {
  timeZone: BOOKING_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function londonParts(at: Date) {
  const out: Record<string, number> = {};
  for (const p of PARTS_FORMAT.formatToParts(at)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour,
    minute: out.minute,
    second: out.second,
  };
}

/** London's UTC offset (ms) at an instant: 0 in GMT, 3_600_000 in BST. */
function londonOffsetMs(at: Date): number {
  const p = londonParts(at);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const truncated = Math.floor(at.getTime() / 1000) * 1000;
  return asUtc - truncated;
}

function keyToUtcMidnight(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
