// A markup on parts, set by the admin (Gareth, 2026-11-18): "a global switch
// in his settings with labour prices which will be on or off for parts
// markup, with a percentage which will mark up the parts for the total price
// of the repair."
//
// Two rows of `platform_settings`, beside the hourly rate (no migration):
//   parts_markup_enabled   1 or 0 (off when missing)
//   parts_markup_rate      a decimal: 0.2 = 20%
//
// Applied once, where every customer price gets its parts
// (quoteJobParts): the repair list and search, the price step, the booking,
// the app's quote and checkout, a mechanic's suggested extra parts. Only
// parts NAPA priced are marked up (Brad, 2026-11-18: "markup will only be on
// napa parts"): NAPA's own answer for the car, or an admin's pick priced live
// by NAPA. An estimate from other cars and an admin's set price are charged
// as they are. Engine oil on a service is priced per litre separately and
// isn't a part. The supplier's cost stays on the line (`costUnitPence`).
//
// The markup is part of the booking's total, so the commission and the
// mechanic's share split it as they split everything else (lib/earnings.ts;
// Brad, 2026-11-18: "keep the calculation as it is").

import type { SupabaseClient } from "@supabase/supabase-js";

import type { QuotedPart } from "./quote-parts";

export const PARTS_MARKUP_ENABLED_KEY = "parts_markup_enabled";
export const PARTS_MARKUP_RATE_KEY = "parts_markup_rate";
/** The most the setting accepts: 100% doubles a part's price. */
export const PARTS_MARKUP_MAX_RATE = 1;

/** The markup from the two settings: 0 when it's off, missing or nonsense. Pure. */
export function partsMarkupRate(enabled: unknown, rate: unknown): number {
  const on = enabled === true || Number(enabled) === 1;
  const r = typeof rate === "number" ? rate : Number(rate);
  if (!on || !Number.isFinite(r) || r <= 0) return 0;
  return Math.min(r, PARTS_MARKUP_MAX_RATE);
}

/** The markup in force now. 0 when off or unreadable. Never throws. */
export async function loadPartsMarkupRate(db: SupabaseClient): Promise<number> {
  try {
    const { data } = await db
      .from("platform_settings")
      .select("key, value")
      .in("key", [PARTS_MARKUP_ENABLED_KEY, PARTS_MARKUP_RATE_KEY]);
    const rows = new Map(((data ?? []) as Array<{ key: string; value: unknown }>).map((r) => [r.key, r.value]));
    return partsMarkupRate(rows.get(PARTS_MARKUP_ENABLED_KEY), rows.get(PARTS_MARKUP_RATE_KEY));
  } catch {
    return 0;
  }
}

/** A part NAPA priced: its answer for this car, or an admin's pick priced live by NAPA. Pure. */
export function isNapaPriced(part: Pick<QuotedPart, "supplier" | "source">): boolean {
  return part.supplier === "aag" && (part.source === "default" || part.source === "chosen");
}

/**
 * The customer's price for each NAPA-priced part: the cost per unit marked up
 * and rounded to the penny, times the quantity. Estimates and set prices, and
 * everything when the markup is off (0), come back as they were. Pure.
 */
export function applyPartsMarkup(parts: readonly QuotedPart[], rate: number): QuotedPart[] {
  if (!(rate > 0)) return [...parts];
  return parts.map((part) => {
    if (!isNapaPriced(part)) return part;
    const cost = part.costUnitPence ?? part.unitPence;
    const unitPence = Math.round(cost * (1 + rate));
    return { ...part, costUnitPence: cost, markupRate: rate, unitPence, linePence: unitPence * part.quantity };
  });
}
