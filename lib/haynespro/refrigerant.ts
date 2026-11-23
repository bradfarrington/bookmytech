// How much air-con refrigerant a car takes, and which gas, from HaynesPro's
// lubricant capacities (2026-11-23), so a regas is charged by weight: Brad,
// "pull parts from NAPA and the amount from HaynesPro". NAPA lists no
// refrigerant on any car (part type 1442 is "empty" everywhere: the
// 2026-11-17 parts-gap review), so the gas is priced from a £ per 100 g
// setting per gas instead (lib/pricing/calculate.ts).
//
// The same getLubricantCapacitiesV4 rows the oil and fluids read. As seen in
// ./__fixtures__:
//
//   Capacities > With R134a refrigerant          (a heading row, no value)
//   Capacities > Refrigerant = 500 ± 15 (g)
//   Capacities > With R1234yf refrigerant
//   Capacities > Refrigerant = 460 ± 15 (g)
//
//   Capacities > Refrigerant = 660 ± 20 (g)   remark "Vehicles without heat pump"
//   Capacities > Refrigerant = 1020 ± 20 (g)  remark "Vehicles with heat pump"
//
//   Capacities > Refrigerant = 400 (g)        (no gas named)
//
// A heading names the gas of the rows after it; so can a row's own name or
// remark, or an ancestor's. Several figures for one gas (heat pump or not)
// take the largest, the safe side for the mechanic, as the fluids do.
//
// Which gas, when HaynesPro lists both or neither: every new car registered
// from 2017 runs on R1234yf (EU MAC directive), and a plate can never make a
// car look newer than it is, so a 2017-or-later age identifier settles it as
// R1234yf. One from 2012 or before is R134a (R1234yf only came in on new
// models from 2011, and barely before 2013). Anything else is charged at the
// dearer gas, the side that never under-quotes. Pure apart from the loader.

import { getCapacities } from "./tree";
import type { HpAdjustment } from "./types";

export type RefrigerantGas = "R134a" | "R1234yf";

export interface RefrigerantCharge {
  /** The gas named for this figure; null when HaynesPro doesn't say. */
  gas: RefrigerantGas | null;
  grams: number;
}

const REFRIGERANT_ROW = /^refrigerant$/i;

function gasIn(text: string | null | undefined): RefrigerantGas | null {
  const t = (text ?? "").toUpperCase().replace(/[\s-]/g, "");
  if (t.includes("R1234YF") || t.includes("HFO1234YF")) return "R1234yf";
  if (t.includes("R134A") || t.includes("HFC134A")) return "R134a";
  return null;
}

/** "500 ± 15" (g) → 500; "0.46" (kg) → 460. Null when it isn't a plausible charge. */
export function parseGrams(value: string | null | undefined, unit: string | null | undefined): number | null {
  if (value == null) return null;
  const first = String(value).replace(/,/g, ".").match(/\d+(?:\.\d+)?/);
  if (!first) return null;
  let grams = Number(first[0]);
  const u = (unit ?? "").toLowerCase().replace(/[()]/g, "").trim();
  if (u === "kg") grams *= 1000;
  else if (u && u !== "g" && u !== "gr" && u !== "gram" && u !== "grams") return null;
  if (!Number.isFinite(grams) || grams < 100 || grams > 3000) return null;
  return Math.round(grams);
}

/** Every refrigerant figure HaynesPro gives, with its gas where named. Pure. */
export function parseRefrigerantCharges(rows: readonly HpAdjustment[] | null | undefined): RefrigerantCharge[] {
  const out: RefrigerantCharge[] = [];
  const walk = (list: readonly HpAdjustment[] | null | undefined, inherited: RefrigerantGas | null) => {
    // A heading ("With R1234yf refrigerant") names the gas of the rows after it.
    let heading: RefrigerantGas | null = null;
    for (const row of list ?? []) {
      const name = (row.name ?? "").trim();
      const own = gasIn(name) ?? gasIn(row.remark);
      if (REFRIGERANT_ROW.test(name)) {
        const grams = parseGrams(row.value, row.unit);
        if (grams != null) out.push({ gas: own ?? heading ?? inherited, grams });
      } else if (own && row.value == null && /refrigerant/i.test(name) && !/compressor/i.test(name)) {
        heading = own;
      }
      if (Array.isArray(row.subAdjustments) && row.subAdjustments.length) {
        walk(row.subAdjustments, own ?? heading ?? inherited);
      }
    }
  };
  walk(rows, null);
  return out;
}

/**
 * The year a UK plate's age identifier gives (AB17CDE → 2017, AB67CDE →
 * 2017), or null for any other format (dateless, prefix, suffix, Northern
 * Irish). Pure.
 */
export function plateYear(reg: string | null | undefined): number | null {
  const m = (reg ?? "").toUpperCase().replace(/\s/g, "").match(/^[A-Z]{2}(\d{2})[A-Z]{3}$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (n >= 2 && n <= 49) return 2000 + n;
  if (n >= 51 && n <= 99) return 2000 + n - 50;
  return null;
}

/** The gas the car's age says, or null when its age doesn't settle it. Pure. */
export function gasForAge(reg: string | null | undefined): RefrigerantGas | null {
  const year = plateYear(reg);
  if (year == null) return null;
  if (year >= 2017) return "R1234yf";
  if (year <= 2012) return "R134a";
  return null;
}

export interface RefrigerantPrices {
  /** Pence per 100 g; null when not set (the regas then goes to a quote). */
  R134a: number | null;
  R1234yf: number | null;
}

export interface RefrigerantQuote {
  gas: RefrigerantGas;
  grams: number;
  pencePer100g: number;
  pence: number;
}

/**
 * What the car's refrigerant costs: HaynesPro's grams for the gas it runs on,
 * × that gas's price. Null when HaynesPro gives no figure or the gas has no
 * price, so the part goes to a manual quote like any other unpriced part. Pure.
 */
export function quoteRefrigerant(
  charges: readonly RefrigerantCharge[],
  prices: RefrigerantPrices,
  reg: string | null | undefined,
): RefrigerantQuote | null {
  if (charges.length === 0) return null;
  const named = [...new Set(charges.map((c) => c.gas).filter((g): g is RefrigerantGas => g != null))];

  let gas: RefrigerantGas | null = named.length === 1 ? named[0] : gasForAge(reg);
  if (gas == null) {
    // Can't tell: the dearer of the gases it could be. With no price for one
    // of them we can't tell what dearer means, so it goes to a quote.
    const options: RefrigerantGas[] = named.length > 0 ? named : ["R134a", "R1234yf"];
    if (options.some((g) => prices[g] == null)) return null;
    gas = options.reduce((a, b) => ((prices[b] as number) > (prices[a] as number) ? b : a));
  }

  const forGas = charges.filter((c) => c.gas === gas);
  const pool = forGas.length > 0 ? forGas : charges.filter((c) => c.gas == null);
  if (pool.length === 0) return null;
  const grams = Math.max(...pool.map((c) => c.grams));

  const pencePer100g = prices[gas];
  if (pencePer100g == null) return null;
  return { gas, grams, pencePer100g, pence: Math.round((grams / 100) * pencePer100g) };
}

/** The car's refrigerant figures (memoised HaynesPro call). Never throws. */
export async function refrigerantChargesFor(carTypeId: number): Promise<RefrigerantCharge[]> {
  const rows = await getCapacities(carTypeId).catch(() => []);
  return parseRefrigerantCharges(rows);
}
