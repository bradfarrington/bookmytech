// Asking each supplier for one part group on one vehicle (Tasks 42, 45).
//
// Shared by the /admin/parts lookup (app/actions/lkq.ts) and a repair's parts
// on the admin vehicle pages (app/actions/repair-parts.ts), so the two can't
// drift. Extracted from app/actions/lkq.ts: a "use server" file may only export
// server actions, and these must not become callable endpoints of their own —
// every caller gates on requireAdmin() first.
//
// Both legs refuse to throw. Every failure comes back as a panel state, so one
// supplier being down degrades its own column and never the page.

import { aagQuote, isAagConfigured } from "@/lib/aag/client";
import { readAagHealth } from "@/lib/aag/health";
import { flattenQuote } from "@/lib/aag/quote";
import { ADS_BUDGET_EXHAUSTED, adsLookupParts, adsLookupVehicle } from "@/lib/lkq/ads";
import { isLkqAdsConfigured, isLkqEcpConfigured, missingLkqEnv } from "@/lib/lkq/config";
import { getLkqPrices } from "@/lib/lkq/ecp";
import { fitmentLabels } from "@/lib/lkq/fitment";
import type { PartGroupMapping } from "@/lib/lkq/mapping";
import type { AdsAttribute } from "@/lib/lkq/types";
import { vehicleSummary, type LkqVehicleSummary } from "@/lib/lkq/vehicle";
import { createAdminClient } from "@/lib/supabase/admin";
import { aagOffers, cheapestOffer, lkqOffers, type SupplierPanel } from "./supplier-offer";

/**
 * The LKQ leg: ADS says what fits, ECP says what it costs. Costs one ADS credit
 * for a new vehicle and one for a new vehicle + component, both cached.
 */
export async function lookupLkqPanel(
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
          "LKQ listed the parts but wouldn't price them. The supplier status on the Parts page shows what it last told us.",
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

/** The AAG leg: one quote per TecDoc part group. */
export async function lookupAagPanel(reg: string, group: PartGroupMapping): Promise<SupplierPanel> {
  if (!group.genart) {
    return {
      state: "not_mapped",
      message:
        "We can't ask Alliance Automotive for this part — we don't yet know which of their product groups matches it.",
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
    let hint: string | null = "The connection check shows what Alliance Automotive last told us.";
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
