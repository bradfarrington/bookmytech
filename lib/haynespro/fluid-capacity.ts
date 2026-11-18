// How much coolant and brake fluid a car holds, from HaynesPro's lubricant
// capacities (2026-11-18), so a fluid is charged by what the engine takes:
// Brad, "shouldn't this calculate the amount of litres needed and then choose
// the bottle that's needed for the engine?"
//
// The same getLubricantCapacitiesV4 rows the engine oil reads
// (oil-capacity.ts). As seen in ./__fixtures__:
//
//   [Engine]                         Cooling system = 4.9 (l)
//   [Electrical system]              Cooling system, electric motor/inverter = 2.6 (l)   ← not the engine's
//   [Brake system : General data]    Brake system = 1.15 (l) · Left-hand drive with manual transmission
//   [Brake system : General data]    Brake system = 2.15 (l) · Right-hand drive with manual transmission
//
// Only rows named exactly "Cooling system" / "Brake system" count; several
// (by drive side or gearbox) take the largest, the safe side for the
// mechanic buying it. Pure apart from the loader at the bottom.

import { parseLitres } from "./oil-capacity";
import { getCapacities } from "./tree";
import type { HpAdjustment } from "./types";

export interface FluidCapacities {
  /** The engine's cooling system, litres. Null when HaynesPro doesn't say. */
  coolantLitres: number | null;
  /** The brake system, litres. */
  brakeFluidLitres: number | null;
}

const COOLING = /^cooling system$/i;
const BRAKES = /^brake system$/i;

function largest(rows: readonly HpAdjustment[] | null | undefined, name: RegExp): number | null {
  let best: number | null = null;
  const walk = (list: readonly HpAdjustment[] | null | undefined) => {
    for (const row of list ?? []) {
      if (name.test((row.name ?? "").trim())) {
        const litres = parseLitres(row.value, row.unit);
        if (litres != null && (best == null || litres > best)) best = litres;
      }
      if (Array.isArray(row.subAdjustments) && row.subAdjustments.length) walk(row.subAdjustments);
    }
  };
  walk(rows);
  return best;
}

export function parseFluidCapacities(rows: readonly HpAdjustment[] | null | undefined): FluidCapacities {
  return { coolantLitres: largest(rows, COOLING), brakeFluidLitres: largest(rows, BRAKES) };
}

/** The car's fluid capacities (memoised HaynesPro call). Never throws. */
export async function fluidCapacitiesFor(carTypeId: number): Promise<FluidCapacities> {
  const rows = await getCapacities(carTypeId).catch(() => []);
  return parseFluidCapacities(rows);
}
