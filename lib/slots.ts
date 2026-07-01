// Booking arrival windows for the customer booking flow.
//
// The booking stores two things: `scheduled_at` (the window START, used for
// ordering and day-grouping) and `slot_window` (the human window the customer
// picked, persisted and shown to both customer and mechanic). A 2-hour window
// and the all-day window can share a start time, so `slot_window` is what
// distinguishes them downstream.

export interface BookingSlotOption {
  /** Persisted + displayed window text, e.g. "8am–10am" or "All day (8am–8pm)". */
  window: string;
  /** Hour of day the window starts — becomes `scheduled_at`. */
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

/** ISO string for a given day at a window's start hour (local time). */
export function slotIso(day: Date, startHour: number): string {
  const d = new Date(day);
  d.setHours(startHour, 0, 0, 0);
  return d.toISOString();
}

/** "Wed 3 Jul" — the calendar-day portion of a slot label. */
function dayPart(when: Date): string {
  return when.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
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
  opts: { relative?: boolean } = {},
): string {
  if (!iso) return "Time to be confirmed";
  const when = new Date(iso);

  let day: string;
  if (opts.relative) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const whenDay = new Date(when);
    whenDay.setHours(0, 0, 0, 0);
    const diff = Math.round((whenDay.getTime() - todayStart.getTime()) / 86_400_000);
    day = diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : dayPart(when);
  } else {
    day = dayPart(when);
  }

  const timePart =
    window ?? when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${timePart}`;
}
