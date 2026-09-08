// Engine-oil capacity from HaynesPro's lubricant capacities (Task 31). Pure —
// unit-tested against real payloads in ./__fixtures__ captured with
// scripts/probe-oil-capacity.mjs.
//
// Gareth (2026-09-08): "£15.00 per litre and get HaynesPro to work out each
// car and what litres go in — this data can be pulled from adjustments and
// specifications." getLubricantCapacitiesV4 is that data. Its shape, as seen
// live on six vehicles:
//
//   one top-level row "Capacities" whose subAdjustments are a FLAT list —
//   heading rows with no value ("Engine", "Brake system : General data",
//   "Manual transmission, 0FB, 6-speed") followed by value rows
//   ("Engine sump, including filter = 4.0 (l)"), with the occasional nested
//   subAdjustments under a heading (gearbox refills, plug locations).
//
// The engine-oil row is consistently "Engine sump, including filter" with unit
// "(l)". A vehicle can have more than one (the Ranger: 7.9 l with a black
// dipstick O-ring, 8.9 l with a red one) and a heading-only "Engine sump …"
// row carrying a caution remark. EVs (Leaf, Model 3) have no engine-oil row
// at all — their oil is in the drive unit / reduction gearbox, which must NOT
// be mistaken for engine oil.

import type { HpAdjustment } from "./types";

export interface EngineOilCapacity {
  /** Litres, to one decimal. */
  litres: number;
  /** The row it came from, for the receipt — "Engine sump, including filter · Red dipstick O-ring". */
  label: string;
  /** True when several figures were listed and the largest was taken. */
  ambiguous: boolean;
}

// Engine oil rows. "sump" is HaynesPro's word for the engine oil pan; "engine
// oil" covers other phrasings. Everything else oily — gearbox, differential,
// transfer box, drive unit, compressor, power steering — is excluded by name
// so an EV's reduction-gearbox oil never prices as engine oil.
const ENGINE_OIL = /\b(engine\s+sump|sump|engine\s+oil|motor\s+oil)\b/i;
const NOT_ENGINE_OIL =
  /gearbox|transmission|differential|transfer|axle|drive\s+unit|reduction|steering|brake|cool|compressor|refrigerant|hydraulic|adblue|washer|fuel|clutch|inverter|battery/i;
const WITH_FILTER = /with(out)?\s+filter|including\s+filter|incl\.?\s+filter|filter\s+change/i;
const WITHOUT_FILTER = /without\s+filter|excluding\s+filter|excl\.?\s+filter/i;

/** "4.0", "4,3", "8.5 - 9.4", "approx. 4.3", "> 4.0" → litres, or null. Ranges take the larger figure. */
export function parseLitres(value: string | null | undefined, unit: string | null | undefined): number | null {
  if (value == null) return null;
  const numbers = String(value)
    .replace(/,/g, ".")
    .match(/\d+(?:\.\d+)?/g)
    ?.map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!numbers?.length) return null;
  let litres = Math.max(...numbers);
  const u = (unit ?? "").toLowerCase().replace(/[()]/g, "").trim();
  if (u === "ml" || u === "cc" || u === "cm3") litres = litres / 1000;
  else if (u === "qt" || u === "quart" || u === "quarts") litres = litres * 0.946;
  else if (u && u !== "l" && u !== "ltr" && u !== "litre" && u !== "litres" && u !== "liter" && u !== "liters") return null;
  else if (!u && (litres < 0.5 || litres > 30)) return null; // unitless and implausible
  if (litres < 0.5 || litres > 30) return null;
  return Math.round(litres * 10) / 10;
}

interface Candidate {
  litres: number;
  label: string;
  /** 2 = with filter, 1 = unspecified, 0 = without filter. */
  filterScore: number;
}

function walk(rows: readonly HpAdjustment[] | null | undefined, out: Candidate[]): void {
  for (const row of rows ?? []) {
    const name = (row.name ?? "").trim();
    if (name && ENGINE_OIL.test(name) && !NOT_ENGINE_OIL.test(name)) {
      const litres = parseLitres(row.value, row.unit);
      if (litres != null) {
        const remark = (row.remark ?? "").trim();
        out.push({
          litres,
          label: remark ? `${name} · ${remark}` : name,
          filterScore: WITHOUT_FILTER.test(name) ? 0 : WITH_FILTER.test(name) ? 2 : 1,
        });
      }
    }
    if (Array.isArray(row.subAdjustments) && row.subAdjustments.length) walk(row.subAdjustments, out);
  }
}

/**
 * The engine-oil capacity a service should charge for, or null when the
 * vehicle has no engine-oil row (an EV) or the data is missing.
 *
 * Prefers a figure that includes the filter change (a service always changes
 * the filter); among equals, takes the LARGEST — charging for the fuller of
 * two listed sumps is the safe side for the mechanic buying the oil, and the
 * receipt names which figure it was.
 */
export function parseEngineOilCapacity(rows: readonly HpAdjustment[] | null | undefined): EngineOilCapacity | null {
  const candidates: Candidate[] = [];
  walk(rows, candidates);
  if (candidates.length === 0) return null;
  const best = Math.max(...candidates.map((c) => c.filterScore));
  const pool = candidates.filter((c) => c.filterScore === best);
  const top = pool.reduce((a, b) => (b.litres > a.litres ? b : a));
  return { litres: top.litres, label: top.label, ambiguous: pool.length > 1 };
}

/** HaynesPro tags a pure EV "ELECTRICAL"; DVLA says "ELECTRICITY". Hybrids carry their combustion fuel. */
export function isElectricOnly(fuelType: string | string[] | null | undefined): boolean {
  const fuels = (Array.isArray(fuelType) ? fuelType : [fuelType]).map((f) => (f ?? "").toUpperCase().trim()).filter(Boolean);
  if (fuels.length === 0) return false;
  return fuels.every((f) => f === "ELECTRICAL" || f === "ELECTRIC" || f === "ELECTRICITY");
}
