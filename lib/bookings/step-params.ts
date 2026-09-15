// What a booking carries between the funnel's steps (Task 47): Price → Time →
// Address → Confirm. Pure, no "server-only", because the Time and Address steps
// are client components that build the next step's URL with it.
//
// The job and the vehicle travel in the URL, as they always have. The chosen
// arrival window does too (`slot`, `window`, `days`): it is not personal. The
// address never does; it lives in sessionStorage (lib/bookings/address-draft.ts),
// keyed by `contextKeyFor`, so personal data stays out of URLs, logs and history.

import { normaliseRepairIds } from "./repair-ids";
import { ALL_DAY_SLOT, TWO_HOUR_SLOTS, isDayKey } from "@/lib/slots";

/** The job and the vehicle: everything a step needs before the time is chosen. */
export interface BookingBaseParams {
  reg: string;
  /** Catalogue item ids in the customer's order. Empty for a follow-on quote. */
  repairs: string[];
  make?: string;
  model?: string;
  postcode?: string;
  /** Preferred mechanic (a rebook). */
  pref?: string;
  /** A follow-on quote (Task 34): the price and vehicle come from it. */
  quote?: string;
}

/** The arrival window chosen on the Time step. */
export interface BookingTimeParams {
  /** ISO start of the window. */
  slot: string;
  /** The stored window label, e.g. "8am–10am" or "All day (8am–8pm)". */
  window: string;
  /** Several all-day days offered (Task 28); empty for a single day. */
  days: string[];
}

const KNOWN_WINDOWS = new Set<string>([
  ...TWO_HOUR_SLOTS.map((slot) => slot.window),
  ALL_DAY_SLOT.window,
]);

/**
 * The time off a page's search params, or null when it is missing or not one
 * we could have written. Bookability is not judged here: Confirm re-checks the
 * window against the clock, and the server refuses a passed one regardless.
 */
export function readTimeParams(params: {
  slot?: string | null;
  window?: string | null;
  days?: string | null;
}): BookingTimeParams | null {
  const window = (params.window ?? "").trim();
  const slotRaw = (params.slot ?? "").trim();
  if (!slotRaw || !KNOWN_WINDOWS.has(window)) return null;
  const at = new Date(slotRaw);
  if (Number.isNaN(at.getTime())) return null;
  const days = [
    ...new Set(
      (params.days ?? "")
        .split(",")
        .map((day) => day.trim())
        .filter(isDayKey),
    ),
  ].sort();
  return { slot: at.toISOString(), window, days: days.length >= 2 ? days : [] };
}

/**
 * The query string for a step: the job and vehicle, plus the time once chosen.
 * A follow-on quote carries only its id (the server derives the rest), plus the
 * postcode the customer may have typed.
 */
export function stepQuery(base: BookingBaseParams, time?: BookingTimeParams | null): string {
  const query = new URLSearchParams();
  if (base.quote) {
    query.set("quote", base.quote);
  } else {
    query.set("reg", base.reg);
    const repairs = normaliseRepairIds(base.repairs);
    if (repairs.length) query.set("repairs", repairs.join(","));
    if (base.make) query.set("make", base.make);
    if (base.model) query.set("model", base.model);
    if (base.pref) query.set("pref", base.pref);
  }
  if (base.postcode) query.set("postcode", base.postcode);
  if (time) {
    query.set("slot", time.slot);
    query.set("window", time.window);
    if (time.days.length >= 2) query.set("days", time.days.join(","));
  }
  return query.toString();
}

/**
 * Which booking an address draft belongs to. A draft typed for one job is never
 * replayed onto a different one started in the same tab.
 */
export function contextKeyFor(base: BookingBaseParams): string {
  return base.quote
    ? `quote:${base.quote}`
    : `repairs:${base.reg.replace(/\s+/g, "").toUpperCase()}|${normaliseRepairIds(base.repairs).join(",")}`;
}
