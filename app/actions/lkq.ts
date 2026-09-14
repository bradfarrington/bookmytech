"use server";

// Live supplier parts lookup for /admin/parts (Task 42).
//
// One registration + any part from LKQ's full 2,277-component catalogue →
// both suppliers' prices, side by side.
//
// There is deliberately NO curated category list gating what can be looked up.
// AAG is asked whenever we happen to know the TecDoc GenArt that pairs with the
// chosen LKQ component (lib/lkq/mapping.ts); where we don't, the AAG column says
// so plainly and the LKQ side still works. The mapping narrows the COMPARISON,
// never the catalogue.
// READ-ONLY: nothing is written except the ADS attribute cache, the credit
// counter and the health rows. Nothing orders. Nothing touches `parts`,
// `booking_parts`, `bookings` or any pricing row.
//
// Both supplier legs are run in parallel and each already refuses to throw, so a
// supplier being down degrades its own column and cannot take the page with it.

import { requireAdmin } from "@/lib/auth/require-admin";
import {
  ADS_BUDGET_EXHAUSTED,
  adsLookupVehicle,
  adsLookupVehicleComponents,
} from "@/lib/lkq/ads";
import { readAdsUsage } from "@/lib/lkq/ads-cache";
import { isLkqAdsConfigured, missingLkqEnv } from "@/lib/lkq/config";
import { componentByNumber, searchComponents } from "@/lib/lkq/components";
import { helloFromLkq } from "@/lib/lkq/ecp";
import { adHocGroup, genartForComponent, type PartGroupMapping } from "@/lib/lkq/mapping";
import type { AdsAttribute, AdsComponent } from "@/lib/lkq/types";
import { adsRegKey, vehicleSummary, type LkqVehicleSummary } from "@/lib/lkq/vehicle";
import {
  bestPriceAcross,
  type SupplierPanel,
} from "@/lib/parts/supplier-offer";
import { lookupAagPanel, lookupLkqPanel } from "@/lib/parts/supplier-lookup";
import { createAdminClient } from "@/lib/supabase/admin";

export type SupplierLookupResult =
  | {
      ok: true;
      reg: string;
      group: PartGroupMapping;
      vehicle: LkqVehicleSummary | null;
      lkq: SupplierPanel;
      aag: SupplierPanel;
      best: { supplier: "lkq" | "aag"; partNumber: string; costPence: number } | null;
      credits: { used: number; cap: number };
    }
  | { ok: false; error: string };

export async function lookupSupplierPartsAction(input: {
  reg: string;
  component: string;
}): Promise<SupplierLookupResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const reg = adsRegKey(input.reg ?? "");
  if (!reg) return { ok: false, error: "Enter a registration." };

  const component = componentByNumber(String(input.component ?? "").trim());
  if (!component) {
    return { ok: false, error: "Pick a part from the list." };
  }

  // Any of the 2,277 components is fair game. If we happen to know the GenArt
  // that pairs with it, AAG gets asked too; if not, the AAG column explains why
  // rather than the part being unavailable.
  const genart = genartForComponent(component.ComponentNumber);
  const group: PartGroupMapping = {
    ...adHocGroup(component.ComponentNumber, component.ComponentName),
    genart,
  };

  const [lkqResult, aag] = await Promise.all([lookupLkqPanel(reg, group), lookupAagPanel(reg, group)]);

  let credits = { used: 0, cap: 0 };
  try {
    const usage = await readAdsUsage(createAdminClient());
    credits = { used: usage.used, cap: usage.cap };
  } catch {
    // The counter is informational; never fail the lookup on it.
  }

  const best = bestPriceAcross({ lkq: lkqResult.panel, aag });

  return {
    ok: true,
    reg,
    group,
    vehicle: lkqResult.vehicle,
    lkq: lkqResult.panel,
    aag,
    best: best
      ? {
          supplier: best.supplier,
          partNumber: best.offer.partNumber,
          costPence: best.offer.costPence as number,
        }
      : null,
    credits,
  };
}

/** Type-ahead over the checked-in component list. No network, no credits. */
export async function searchLkqComponentsAction(
  query: string,
): Promise<Array<{ number: string; name: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  return searchComponents(query, 50).map((c) => ({
    number: c.ComponentNumber,
    name: c.ComponentName,
  }));
}

/**
 * Ping LKQ without credentials. Separates "LKQ is down" from "our credentials
 * are wrong" — the ambiguity that cost Task 40 a day on AAG.
 */
export async function pingLkqAction(): Promise<
  { ok: true; message: string } | { ok: false; error: string }
> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const greeting = await helloFromLkq();
  if (!greeting) {
    return { ok: false, error: "No reply from LKQ's pricing service — it looks unreachable." };
  }
  return { ok: true, message: greeting };
}


// ---------------------------------------------------------------------------
// Step 1: a registration -> everything LKQ lists for that vehicle.
// ---------------------------------------------------------------------------

export interface VehicleComponent {
  number: string;
  name: string;
  /** Whether we can also ask Alliance Automotive about this one. */
  comparable: boolean;
}

export type VehicleCatalogueResult =
  | {
      ok: true;
      reg: string;
      vehicle: LkqVehicleSummary | null;
      components: VehicleComponent[];
      cached: boolean;
      credits: { used: number; cap: number };
    }
  | { ok: false; error: string };

/**
 * Everything LKQ lists for one registration.
 *
 * This is the answer to "show me the whole catalogue for this car": LKQ's own
 * 2,277-component catalogue narrowed to the couple of hundred that actually fit
 * (a 2007 Volvo S40 returns 211). Costs at most two credits — one to identify
 * the vehicle, one for its component list — and both are cached for 30 days,
 * so the same reg is free afterwards.
 *
 * PRICES ARE NOT FETCHED HERE. Pricing every component would be one credit each,
 * which for 211 components would be most of a month's budget on a single car.
 * The prices come from lookupSupplierPartsAction when a part is chosen.
 */
export async function lookupVehicleCatalogueAction(input: {
  reg: string;
}): Promise<VehicleCatalogueResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const reg = adsRegKey(input.reg ?? "");
  if (!reg) return { ok: false, error: "Enter a registration." };

  if (!isLkqAdsConfigured()) {
    const missing = missingLkqEnv();
    return {
      ok: false,
      error: `LKQ's catalogue isn't configured here — missing ${missing.ads.join(", ")}.`,
    };
  }

  const vehicleResult = await adsLookupVehicle(reg);
  if (vehicleResult === ADS_BUDGET_EXHAUSTED) {
    return {
      ok: false,
      error:
        "The monthly LKQ catalogue budget is spent, so no new vehicles can be looked up. It resets next month.",
    };
  }
  if (!vehicleResult) {
    return { ok: false, error: "LKQ's catalogue couldn't identify that registration." };
  }

  const attributes: AdsAttribute[] = vehicleResult.value;
  const componentsResult = await adsLookupVehicleComponents(reg, attributes);
  if (componentsResult === ADS_BUDGET_EXHAUSTED) {
    return {
      ok: false,
      error:
        "The monthly LKQ catalogue budget is spent, so the parts list couldn't be fetched. It resets next month.",
    };
  }
  if (!componentsResult) {
    return { ok: false, error: "LKQ didn't return a parts list for that vehicle." };
  }

  let credits = { used: 0, cap: 0 };
  try {
    const usage = await readAdsUsage(createAdminClient());
    credits = { used: usage.used, cap: usage.cap };
  } catch {
    // Informational only.
  }

  const components: VehicleComponent[] = (componentsResult.value as AdsComponent[])
    .map((c) => ({
      number: c.ComponentNumber,
      name: c.ComponentName,
      comparable: genartForComponent(c.ComponentNumber) !== null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    ok: true,
    reg,
    vehicle: vehicleSummary(attributes),
    components,
    cached: vehicleResult.cached && componentsResult.cached,
    credits,
  };
}
