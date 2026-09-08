import type { SupabaseClient } from "@supabase/supabase-js";
import { getEngineOilDefaultLitres, getEngineOilPricePerLitrePence } from "@/lib/pricing/calculate";
import { oilQuoteFor, type OilQuote } from "@/lib/catalogue/products";
import { isElectricOnly, parseEngineOilCapacity } from "./oil-capacity";
import { getCapacities, getCarTypeNode } from "./tree";

// The engine-oil line for a servicing product on one vehicle (Task 31):
// HaynesPro's stated capacity × the per-litre setting, falling back to the
// admin's default litres when HaynesPro has no figure. A pure EV gets no oil
// line at all (litres 0) — it has no engine oil, whatever the default says.
//
// Both HaynesPro reads are memoised in tree.ts, so pricing a service is
// normally free after the first look at a car type.

export async function engineOilForVehicle(carTypeId: number, db: SupabaseClient): Promise<OilQuote> {
  const [pencePerLitre, defaultLitres, carType] = await Promise.all([
    getEngineOilPricePerLitrePence(db),
    getEngineOilDefaultLitres(db),
    getCarTypeNode(carTypeId).catch(() => null),
  ]);
  if (carType && isElectricOnly(carType.fuelType)) {
    return oilQuoteFor(0, pencePerLitre, "haynespro", null);
  }
  const rows = await getCapacities(carTypeId).catch(() => []);
  const parsed = parseEngineOilCapacity(rows);
  if (parsed) return oilQuoteFor(parsed.litres, pencePerLitre, "haynespro", parsed.label);
  return oilQuoteFor(defaultLitres, pencePerLitre, "default", null);
}
