"use server";

// Supplier parts catalogue for /admin/parts (Task 42).
//
// Pick a vehicle, then pull part types from LKQ's full 2,277-component
// catalogue. Results accumulate into one browsable list the admin can filter by
// brand and supplier, in list or card view.
//
// READ-ONLY: nothing is written except the ADS attribute/parts cache, the credit
// counter and the health rows. Nothing orders.
//
// There is no "browse all parts" — LKQ's catalogue only answers "what fits this
// registration", and each part type costs one metered credit. So the unit of
// work is (vehicle, component), cached, and the UI shows the running cost.

import { aagQuote, isAagConfigured } from "@/lib/aag/client";
import { readAagHealth } from "@/lib/aag/health";
import { flattenQuote } from "@/lib/aag/quote";
import { requireAdmin } from "@/lib/auth/require-admin";
import { ADS_BUDGET_EXHAUSTED, adsLookupParts, adsLookupVehicle } from "@/lib/lkq/ads";
import { readAdsUsage } from "@/lib/lkq/ads-cache";
import { isLkqAdsConfigured, isLkqEcpConfigured, missingLkqEnv } from "@/lib/lkq/config";
import { componentByNumber, searchComponents } from "@/lib/lkq/components";
import { getLkqPrices, helloFromLkq } from "@/lib/lkq/ecp";
import { fitmentLabels } from "@/lib/lkq/fitment";
import { adHocGroup, genartForComponent } from "@/lib/lkq/mapping";
import type { AdsAttribute } from "@/lib/lkq/types";
import { adsRegKey, vehicleSummary, type LkqVehicleSummary } from "@/lib/lkq/vehicle";
import { buildComparisonRows, type ComparisonRow } from "@/lib/parts/compare-rows";
import { aagOffers, lkqOffers, type SupplierOffer } from "@/lib/parts/supplier-offer";
import { createAdminClient } from "@/lib/supabase/admin";

/** Why a supplier contributed nothing to this part type. */
export interface SupplierNote {
  supplier: "lkq" | "aag";
  message: string;
  hint: string | null;
  href: string | null;
}

export interface PartTypeResult {
  component: string;
  componentName: string;
  rows: ComparisonRow[];
  /** Catalogue numbers LKQ priced at £0.00 — surfaced, never silently dropped. */
  notFound: string[];
  /** True when nothing was spent because both halves came from cache. */
  cached: boolean;
  notes: SupplierNote[];
}

export type LookupPartTypeResult =
  | {
      ok: true;
      reg: string;
      vehicle: LkqVehicleSummary | null;
      result: PartTypeResult;
      credits: { used: number; cap: number };
    }
  | { ok: false; error: string };

/** The LKQ leg: ADS says what fits, ECP says what it costs. Never throws. */
async function lkqLeg(
  reg: string,
  component: string,
): Promise<{
  offers: SupplierOffer[];
  notFound: string[];
  cached: boolean;
  vehicle: LkqVehicleSummary | null;
  note: SupplierNote | null;
}> {
  const none = (message: string, hint: string | null = null) => ({
    offers: [] as SupplierOffer[],
    notFound: [] as string[],
    cached: false,
    vehicle: null,
    note: { supplier: "lkq" as const, message, hint, href: null },
  });

  if (!isLkqAdsConfigured() || !isLkqEcpConfigured()) {
    const missing = missingLkqEnv();
    return none(
      "LKQ isn't configured on this environment.",
      `Missing: ${[...missing.ecp, ...missing.ads].join(", ")}`,
    );
  }

  const vehicleResult = await adsLookupVehicle(reg);
  if (vehicleResult === ADS_BUDGET_EXHAUSTED) {
    return none(
      "The monthly LKQ catalogue budget is spent.",
      "It resets at the start of next month, or raise LKQ_ADS_MONTHLY_CALL_CAP.",
    );
  }
  if (!vehicleResult) {
    return none("LKQ's catalogue couldn't identify that registration.");
  }

  const attributes: AdsAttribute[] = vehicleResult.value;
  const vehicle = vehicleSummary(attributes);

  const partsResult = await adsLookupParts(reg, component, attributes);
  if (partsResult === ADS_BUDGET_EXHAUSTED) {
    return {
      ...none(
        "The monthly LKQ catalogue budget is spent.",
        "It resets at the start of next month, or raise LKQ_ADS_MONTHLY_CALL_CAP.",
      ),
      vehicle,
    };
  }
  if (!partsResult) {
    return { ...none("LKQ's catalogue didn't answer for this part."), vehicle };
  }

  const parts = partsResult.value.Parts ?? [];
  if (parts.length === 0) {
    return {
      offers: [],
      notFound: [],
      cached: vehicleResult.cached && partsResult.cached,
      vehicle,
      note: {
        supplier: "lkq",
        message: "LKQ lists nothing of this type for this vehicle.",
        hint: null,
        href: null,
      },
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
      ...none(
        "LKQ listed the parts but wouldn't price them.",
        "The status above shows what its pricing service last told us.",
      ),
      vehicle,
    };
  }

  const group = adHocGroup(component, componentByNumber(component)?.ComponentName ?? component);
  return {
    offers: lkqOffers(group, parts, fitmentLabels(partsResult.value), priced.rows),
    notFound: priced.notFound,
    cached: vehicleResult.cached && partsResult.cached,
    vehicle,
    note: null,
  };
}

/**
 * The AAG leg. Only possible where we have a TecDoc GenArt for the component —
 * the two suppliers use unrelated product-group numbering, and only a handful
 * of pairings are known (lib/lkq/mapping.ts).
 */
async function aagLeg(
  reg: string,
  component: string,
  componentName: string,
): Promise<{ offers: SupplierOffer[]; note: SupplierNote | null }> {
  const genart = genartForComponent(component);

  if (!genart) {
    return {
      offers: [],
      note: {
        supplier: "aag",
        message: "No Alliance Automotive equivalent for this part type.",
        hint: "The two suppliers use unrelated product-group numbering; only a few pairings are mapped.",
        href: null,
      },
    };
  }

  if (!isAagConfigured()) {
    return {
      offers: [],
      note: {
        supplier: "aag",
        message: "Alliance Automotive isn't configured on this environment.",
        hint: "Add AAG_API_KEY and AAG_CUSTOMER_ID.",
        href: "/admin/parts/aag-check",
      },
    };
  }

  const body = await aagQuote(reg, genart);
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
      offers: [],
      note: {
        supplier: "aag",
        message: "Alliance Automotive didn't return a price.",
        hint,
        href: "/admin/parts/aag-check",
      },
    };
  }

  const group = adHocGroup(component, componentName);
  return { offers: aagOffers({ ...group, genart }, flattenQuote(body)), note: null };
}

/**
 * Pull one part type for one vehicle. The client accumulates these, so this
 * deliberately does ONE part type per call — each is a metered credit and the
 * admin should be able to see what each press cost.
 */
export async function lookupPartTypeAction(input: {
  reg: string;
  component: string;
}): Promise<LookupPartTypeResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const reg = adsRegKey(input.reg ?? "");
  if (!reg) return { ok: false, error: "Enter a registration." };

  const component = componentByNumber(String(input.component ?? "").trim());
  if (!component) {
    return { ok: false, error: "That isn't a part LKQ lists. Pick one from the list." };
  }

  const [lkq, aag] = await Promise.all([
    lkqLeg(reg, component.ComponentNumber),
    aagLeg(reg, component.ComponentNumber, component.ComponentName),
  ]);

  let credits = { used: 0, cap: 0 };
  try {
    const usage = await readAdsUsage(createAdminClient());
    credits = { used: usage.used, cap: usage.cap };
  } catch {
    // The counter is informational; never fail the lookup on it.
  }

  const notes = [lkq.note, aag.note].filter((n): n is SupplierNote => n !== null);

  return {
    ok: true,
    reg,
    vehicle: lkq.vehicle,
    result: {
      component: component.ComponentNumber,
      componentName: component.ComponentName,
      rows: buildComparisonRows(lkq.offers, aag.offers),
      notFound: lkq.notFound,
      cached: lkq.cached,
      notes,
    },
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
