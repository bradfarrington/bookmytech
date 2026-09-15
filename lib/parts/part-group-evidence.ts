// The LKQ lookups behind the part group matcher (Task 45).
//
// Matching a HaynesPro part group to an LKQ component by name is guesswork, so
// the matcher works from one real car instead:
//   - the LKQ components that fit that car, so the choice is a couple of
//     hundred real candidates rather than 2,277 names;
//   - what LKQ returns for one candidate component on that car, with pictures.
//
// Alliance Automotive is not asked: it takes part groups directly, so there is
// nothing to match on its side.
//
// Server-only: these spend metered LKQ credits (one per new car, one per new
// car's component list, one per new car + component, all cached). Every caller
// gates on requireAdmin() first. None of them throw, and none fetch prices.

import { ADS_BUDGET_EXHAUSTED, adsLookupParts, adsLookupVehicle, adsLookupVehicleComponents } from "@/lib/lkq/ads";
import { componentByNumber } from "@/lib/lkq/components";
import { isLkqAdsConfigured } from "@/lib/lkq/config";
import type { AdsComponent } from "@/lib/lkq/types";
import { describeVehicle, vehicleSummary } from "@/lib/lkq/vehicle";
import { adsPartExamples, examplesPanel, type ExamplesPanel } from "./part-examples";

const BUDGET_SPENT =
  "The monthly LKQ catalogue budget is spent, so no new lookups can run. It resets at the start of next month.";

export type FittingComponents =
  | { state: "ok"; components: AdsComponent[]; vehicle: string | null }
  | { state: "unavailable"; message: string };

/** The LKQ components that fit this car, by name, duplicates dropped. */
export async function lkqFittingComponents(reg: string): Promise<FittingComponents> {
  if (!isLkqAdsConfigured()) {
    return { state: "unavailable", message: "LKQ's catalogue isn't configured on this environment." };
  }
  const vehicleResult = await adsLookupVehicle(reg);
  if (vehicleResult === ADS_BUDGET_EXHAUSTED) return { state: "unavailable", message: BUDGET_SPENT };
  if (!vehicleResult) return { state: "unavailable", message: "LKQ's catalogue couldn't identify that registration." };

  const componentsResult = await adsLookupVehicleComponents(reg, vehicleResult.value);
  if (componentsResult === ADS_BUDGET_EXHAUSTED) return { state: "unavailable", message: BUDGET_SPENT };
  if (!componentsResult) return { state: "unavailable", message: "LKQ didn't return a parts list for that car." };

  const byNumber = new Map(componentsResult.value.map((c) => [c.ComponentNumber, c]));
  return {
    state: "ok",
    components: [...byNumber.values()].sort((a, b) => a.ComponentName.localeCompare(b.ComponentName)),
    vehicle: describeVehicle(vehicleSummary(vehicleResult.value)) || null,
  };
}

/** What LKQ lists for one component on this car. One LKQ credit the first time. */
export async function lkqComponentExamples(reg: string, componentNumber: string): Promise<ExamplesPanel> {
  const component = componentByNumber(componentNumber);
  if (!component) return { state: "unavailable", message: "That isn't a part on LKQ's list." };
  if (!isLkqAdsConfigured()) {
    return { state: "unavailable", message: "LKQ's catalogue isn't configured on this environment." };
  }

  const vehicleResult = await adsLookupVehicle(reg);
  if (vehicleResult === ADS_BUDGET_EXHAUSTED) return { state: "unavailable", message: BUDGET_SPENT };
  if (!vehicleResult) return { state: "unavailable", message: "LKQ's catalogue couldn't identify that registration." };

  const partsResult = await adsLookupParts(reg, component.ComponentNumber, vehicleResult.value);
  if (partsResult === ADS_BUDGET_EXHAUSTED) return { state: "unavailable", message: BUDGET_SPENT };
  if (!partsResult) return { state: "unavailable", message: `LKQ's catalogue didn't answer for ${component.ComponentName}.` };

  return examplesPanel(
    adsPartExamples(partsResult.value, component.ComponentName),
    `LKQ lists no ${component.ComponentName.trim()} for this car.`,
  );
}
