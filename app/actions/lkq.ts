"use server";

// Live supplier parts lookup for /admin/parts (Task 42).
//
// One registration + one product group → both suppliers' prices, side by side.
// READ-ONLY: nothing is written except the ADS attribute cache, the credit
// counter and the health rows. Nothing orders. Nothing touches `parts`,
// `booking_parts`, `bookings` or any pricing row.
//
// Both supplier legs are run in parallel and each already refuses to throw, so a
// supplier being down degrades its own column and cannot take the page with it.

import { aagQuote, isAagConfigured } from "@/lib/aag/client";
import { readAagHealth } from "@/lib/aag/health";
import { flattenQuote } from "@/lib/aag/quote";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ADS_BUDGET_EXHAUSTED, adsLookupParts, adsLookupVehicle } from "@/lib/lkq/ads";
import { fitmentLabels } from "@/lib/lkq/fitment";
import { readAdsUsage } from "@/lib/lkq/ads-cache";
import { isLkqAdsConfigured, isLkqEcpConfigured, missingLkqEnv } from "@/lib/lkq/config";
import { componentByNumber, searchComponents } from "@/lib/lkq/components";
import { getLkqPrices, helloFromLkq } from "@/lib/lkq/ecp";
import { adHocGroup, groupByKey, type PartGroupMapping } from "@/lib/lkq/mapping";
import type { AdsAttribute } from "@/lib/lkq/types";
import { adsRegKey, vehicleSummary, type LkqVehicleSummary } from "@/lib/lkq/vehicle";
import {
  aagOffers,
  bestPriceAcross,
  cheapestOffer,
  lkqOffers,
  type SupplierPanel,
} from "@/lib/parts/supplier-offer";
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

/**
 * The LKQ leg: ADS says what fits, ECP says what it costs. Every failure is
 * returned as a panel state rather than thrown, so the AAG column still renders.
 */
async function lkqPanel(
  reg: string,
  group: PartGroupMapping,
): Promise<{ panel: SupplierPanel; vehicle: LkqVehicleSummary | null }> {
  if (!group.component) {
    return {
      panel: {
        state: "not_mapped",
        message: "We don't have an LKQ component for this product group yet.",
      },
      vehicle: null,
    };
  }

  if (!isLkqAdsConfigured() || !isLkqEcpConfigured()) {
    const missing = missingLkqEnv();
    return {
      panel: {
        state: "not_connected",
        message: "LKQ isn't configured on this environment.",
        hint: `Missing: ${[...missing.ecp, ...missing.ads].join(", ")}`,
        href: null,
      },
      vehicle: null,
    };
  }

  const vehicleResult = await adsLookupVehicle(reg);
  if (vehicleResult === ADS_BUDGET_EXHAUSTED) {
    return {
      panel: {
        state: "not_connected",
        message: "The monthly LKQ catalogue budget is spent, so no new lookups can run.",
        hint: "It resets at the start of next month, or raise LKQ_ADS_MONTHLY_CALL_CAP.",
        href: null,
      },
      vehicle: null,
    };
  }
  if (!vehicleResult) {
    return {
      panel: {
        state: "error",
        message: "LKQ's catalogue couldn't identify that registration.",
      },
      vehicle: null,
    };
  }

  const attributes: AdsAttribute[] = vehicleResult.value;
  const vehicle = vehicleSummary(attributes);

  const partsResult = await adsLookupParts(reg, group.component, attributes);
  if (partsResult === ADS_BUDGET_EXHAUSTED) {
    return {
      panel: {
        state: "not_connected",
        message: "The monthly LKQ catalogue budget is spent, so no new lookups can run.",
        hint: "It resets at the start of next month, or raise LKQ_ADS_MONTHLY_CALL_CAP.",
        href: null,
      },
      vehicle,
    };
  }
  if (!partsResult) {
    return {
      panel: { state: "error", message: "LKQ's catalogue didn't answer for that product group." },
      vehicle,
    };
  }

  const parts = partsResult.value.Parts ?? [];
  if (parts.length === 0) {
    return {
      panel: {
        state: "empty",
        message: `LKQ lists no ${group.label.toLowerCase()} for this vehicle.`,
      },
      vehicle,
    };
  }

  const priced = await getLkqPrices(
    parts
      .map((p) => String(p?.PartNumber ?? "").trim())
      .filter(Boolean)
      .map((supplierPartNo) => ({ supplierPartNo })),
  );

  if (!priced) {
    return {
      panel: {
        state: "error",
        message:
          "LKQ listed the parts but wouldn't price them. The status above shows what it last told us.",
      },
      vehicle,
    };
  }

  const offers = lkqOffers(group, parts, fitmentLabels(partsResult.value), priced.rows);
  const cached = vehicleResult.cached && partsResult.cached;

  return {
    panel: {
      state: "ok",
      offers,
      cheapestPartNumber: cheapestOffer(offers)?.partNumber ?? null,
      notFound: priced.notFound,
      cached,
    },
    vehicle,
  };
}

/** The AAG leg. Currently expected to report "not connected" — see Task 40. */
async function aagPanel(reg: string, group: PartGroupMapping): Promise<SupplierPanel> {
  if (!group.genart) {
    return {
      state: "not_mapped",
      message:
        "We don't have an Alliance Automotive product group for this part, so they can't be asked for a like-for-like price.",
    };
  }

  if (!isAagConfigured()) {
    return {
      state: "not_connected",
      message: "Alliance Automotive isn't configured on this environment.",
      hint: "Add AAG_API_KEY and AAG_CUSTOMER_ID.",
      href: "/admin/parts/aag-check",
    };
  }

  const body = await aagQuote(reg, group.genart);
  if (!body) {
    let hint: string | null =
      "Their sandbox blocks our server's IP and we're waiting on their allowlist.";
    try {
      const health = await readAagHealth(createAdminClient());
      if (health?.detail) hint = health.detail;
    } catch {
      // Keep the default explanation.
    }
    return {
      state: "not_connected",
      message: "Alliance Automotive didn't return a price.",
      hint,
      href: "/admin/parts/aag-check",
    };
  }

  const offers = aagOffers(group, flattenQuote(body));
  if (offers.length === 0) {
    return {
      state: "empty",
      message: `Alliance Automotive listed no ${group.label.toLowerCase()} for this vehicle.`,
    };
  }

  return {
    state: "ok",
    offers,
    cheapestPartNumber: cheapestOffer(offers)?.partNumber ?? null,
    notFound: [],
    cached: false,
  };
}

export async function lookupSupplierPartsAction(input: {
  reg: string;
  groupKey?: string;
  component?: string;
}): Promise<SupplierLookupResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const reg = adsRegKey(input.reg ?? "");
  if (!reg) return { ok: false, error: "Enter a registration." };

  // Either a curated group (both suppliers) or a raw LKQ component (LKQ only).
  let group: PartGroupMapping | null = input.groupKey ? groupByKey(input.groupKey) : null;
  if (!group && input.component) {
    const component = componentByNumber(input.component.trim());
    if (!component) {
      return { ok: false, error: "That isn't a component LKQ lists. Pick one from the list." };
    }
    group = adHocGroup(component.ComponentNumber, component.ComponentName);
  }
  if (!group) return { ok: false, error: "Choose a part to look up." };

  const [lkqResult, aag] = await Promise.all([lkqPanel(reg, group), aagPanel(reg, group)]);

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
