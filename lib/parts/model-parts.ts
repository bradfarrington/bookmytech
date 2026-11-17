// Parts an admin picked for a model, for when NAPA lists nothing for it
// (Task 77).
//
// NAPA sells headlight bulbs, shocks and wheel bearings on older cars but has
// nothing listed against a 2024 Ranger. Rather than type in a price, Gareth
// picks the NAPA part for that model and part type (optionally per axle), and
// customers are charged NAPA's live price for it (owner decision, 2026-11-17:
// "we don't want to be adding in prices manually, we want to be selecting
// parts").
//
// The pick is keyed on HaynesPro's exact model (`hp_model_label`, so "FORD
// Ranger" is apart from an older "FORD Ranger (TKE)") and stored as the part's
// identity only (`model_part_choices`, migration 0090). Its price comes from
// /api/product/info, which prices a part number without a vehicle and gives
// the same trade price the car lookups do (checked live, 2026-11-17). Prices
// are kept in `aag_product_prices` on the same rules as aag_part_prices: used
// as-is for 12 hours, then asked again, with the last answer used for up to 7
// days when NAPA can't answer.
//
// A pick is only used where NAPA has no part for the car itself: NAPA's own
// exact match always comes first. It comes before an estimate from other
// cars of the model (part-estimates.ts), since it's a real part at a real price.

import type { SupabaseClient } from "@supabase/supabase-js";

import { aagProductInfo, aagRegKey } from "@/lib/aag/client";
import { isSellable, poundsToPence } from "@/lib/aag/quote";
import type { AagProductInfo, AagProductInfoBody } from "@/lib/aag/types";
import { AAG_PRICE_FRESH_MS, AAG_PRICE_LAST_KNOWN_MS, type AagPartOffers } from "./aag-part-prices";
import { isMissingTable } from "./part-group-settings";
import type { PartPosition, SupplierOffer } from "./supplier-offer";

const CHOICES = "model_part_choices";
const PRICES = "aag_product_prices";

/** The car's model as HaynesPro names it, from `haynespro_vehicle_cache`. */
export interface VehicleModel {
  make: string;
  modelLabel: string;
}

/** A row of `model_part_choices` (migration 0090). */
export interface ModelPartChoiceRow {
  id: string;
  make_name: string;
  model_label: string;
  genart_id: number;
  position: PartPosition | null;
  product_id: string;
  label: string | null;
  brand: string | null;
  description: string | null;
  chosen_at: string;
}

/** A row of `aag_product_prices` (migration 0090). */
export interface ProductPriceRow {
  product_id: string;
  state: "ok" | "missing";
  info: AagProductInfo;
  fetched_at: string;
}

export interface ProductPriceOptions {
  /** /api/product/info, injectable for tests. */
  fetch?: (ids: string[]) => Promise<AagProductInfoBody | null>;
  now?: number;
}

export type ProductPrice =
  | { state: "ok"; info: AagProductInfo; pricedAt: string; lastKnown: boolean }
  /** NAPA says it doesn't know the part number. */
  | { state: "missing" }
  /** No answer now, and none from the last 7 days. */
  | { state: "unavailable" };

/** The car's HaynesPro model, or null when the registration isn't cached. Never throws. */
export async function loadVehicleModel(db: SupabaseClient, reg: string): Promise<VehicleModel | null> {
  const regKey = aagRegKey(reg);
  if (!regKey) return null;
  try {
    const { data } = await db
      .from("haynespro_vehicle_cache")
      .select("hp_make, hp_model_label")
      .eq("reg", regKey)
      .maybeSingle();
    const row = data as { hp_make?: string | null; hp_model_label?: string | null } | null;
    if (!row?.hp_make?.trim() || !row.hp_model_label?.trim()) return null;
    return { make: row.hp_make.trim(), modelLabel: row.hp_model_label.trim() };
  } catch {
    return null;
  }
}

/** The admin's picks for this model among these part types. Empty while 0090 is missing. Never throws. */
export async function loadModelPartChoices(
  db: SupabaseClient,
  model: VehicleModel,
  genartIds: readonly number[],
): Promise<ModelPartChoiceRow[]> {
  if (genartIds.length === 0) return [];
  try {
    const { data, error } = await db
      .from(CHOICES)
      .select("id, make_name, model_label, genart_id, position, product_id, label, brand, description, chosen_at")
      .eq("make_name", model.make)
      .eq("model_label", model.modelLabel)
      .in("genart_id", [...new Set(genartIds)]);
    if (error) {
      if (!isMissingTable(error)) console.error("[parts] couldn't read model part choices:", error.message);
      return [];
    }
    return (data ?? []) as ModelPartChoiceRow[];
  } catch {
    return [];
  }
}

function ageMs(at: string, now: number): number {
  const stamp = Date.parse(at);
  return Number.isFinite(stamp) ? now - stamp : Number.POSITIVE_INFINITY;
}

/**
 * What to use, and what to store, for one part number once NAPA has been
 * asked (`answer` undefined when NAPA couldn't answer). Pure, unit-tested.
 */
export function settleProductPrice(
  row: ProductPriceRow | null,
  answer: { found: AagProductInfo } | { found: null } | undefined,
  at: { productId: string; now: number },
): { result: ProductPrice; write: ProductPriceRow | null } {
  const nowIso = new Date(at.now).toISOString();
  if (answer && answer.found) {
    return {
      result: { state: "ok", info: answer.found, pricedAt: nowIso, lastKnown: false },
      write: { product_id: at.productId, state: "ok", info: answer.found, fetched_at: nowIso },
    };
  }
  if (answer && !answer.found) {
    return {
      result: { state: "missing" },
      write: { product_id: at.productId, state: "missing", info: {}, fetched_at: nowIso },
    };
  }
  if (row && row.state === "ok" && ageMs(row.fetched_at, at.now) <= AAG_PRICE_LAST_KNOWN_MS) {
    return { result: { state: "ok", info: row.info, pricedAt: row.fetched_at, lastKnown: true }, write: null };
  }
  return { result: { state: "unavailable" }, write: null };
}

/**
 * NAPA's price for each part number: stored answers under 12 hours old, NAPA
 * asked in one call for the rest. Never throws.
 */
export async function loadProductPrices(
  db: SupabaseClient,
  productIds: readonly string[],
  options: ProductPriceOptions = {},
): Promise<Map<string, ProductPrice>> {
  const ids = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
  const prices = new Map<string, ProductPrice>();
  if (ids.length === 0) return prices;
  const now = options.now ?? Date.now();

  let rows = new Map<string, ProductPriceRow>();
  try {
    const { data, error } = await db.from(PRICES).select("product_id, state, info, fetched_at").in("product_id", ids);
    if (!error) rows = new Map(((data ?? []) as ProductPriceRow[]).map((r) => [r.product_id, r]));
  } catch {
    // Nothing stored: ask NAPA for all of them.
  }

  const stale: string[] = [];
  for (const id of ids) {
    const row = rows.get(id);
    if (row && ageMs(row.fetched_at, now) < AAG_PRICE_FRESH_MS) {
      prices.set(id, row.state === "ok" ? { state: "ok", info: row.info, pricedAt: row.fetched_at, lastKnown: false } : { state: "missing" });
    } else {
      stale.push(id);
    }
  }
  if (stale.length === 0) return prices;

  let body: AagProductInfoBody | null = null;
  try {
    body = await (options.fetch ?? aagProductInfo)(stale);
  } catch {
    body = null;
  }
  const found = new Map<string, AagProductInfo>();
  for (const product of body?.Products ?? []) {
    const id = product.ProductId?.trim();
    if (id) found.set(id, product);
  }

  const writes: ProductPriceRow[] = [];
  for (const id of stale) {
    // NAPA answered: a part it didn't return is one it doesn't know.
    const answer = body == null ? undefined : found.has(id) ? { found: found.get(id)! } : { found: null };
    const settled = settleProductPrice(rows.get(id) ?? null, answer, { productId: id, now });
    prices.set(id, settled.result);
    if (settled.write) writes.push(settled.write);
  }
  if (writes.length > 0) {
    try {
      await db.from(PRICES).upsert(writes, { onConflict: "product_id" });
    } catch {
      // Not kept: NAPA is asked again next time.
    }
  }
  return prices;
}

/** A picked part as an offer, so the usual selection and pricing handle it. Pure. */
export function modelPartOffer(choice: ModelPartChoiceRow, info: AagProductInfo): SupplierOffer {
  const costPence = poundsToPence(info.CostPrice);
  const surcharge = poundsToPence(info.Surcharge);
  const sellable = isSellable(info.CustomerLockoutRating);
  const quantity = typeof info.RecMinOrdQty === "number" && info.RecMinOrdQty > 0 ? info.RecMinOrdQty : 1;
  return {
    supplier: "aag",
    partNumber: choice.product_id,
    description: info.ProductDescription?.trim() || choice.description,
    brand: info.Brand?.trim() || choice.brand,
    tier: info.BrandRating?.trim() || null,
    costPence,
    surchargePence: surcharge != null && surcharge > 0 ? surcharge : null,
    availability: [],
    totalQty: null,
    fitment: [],
    quantityOfFit: quantity,
    position: choice.position,
    imageUrl: null,
    notes: sellable ? [] : [`Locked out: ${info.CustomerLockoutRating}`],
    buyable: sellable && costPence != null,
    modelPart: true,
  };
}

/**
 * The picked parts for these part types, as NAPA answers (Task 77): one
 * entry per part type that has at least one priced pick. Part types whose
 * picks NAPA couldn't price are left out, so they fall through to estimates
 * and set prices as before. Never throws.
 */
export async function loadModelPartOffers(
  db: SupabaseClient,
  model: VehicleModel,
  genartIds: readonly number[],
  options: ProductPriceOptions = {},
): Promise<Map<number, AagPartOffers>> {
  const result = new Map<number, AagPartOffers>();
  const choices = await loadModelPartChoices(db, model, genartIds);
  if (choices.length === 0) return result;
  const prices = await loadProductPrices(db, choices.map((c) => c.product_id), options);

  const byGenart = new Map<number, { offers: SupplierOffer[]; pricedAt: string; lastKnown: boolean }>();
  for (const choice of choices) {
    const price = prices.get(choice.product_id.trim());
    if (!price || price.state !== "ok") continue;
    const entry = byGenart.get(choice.genart_id) ?? { offers: [], pricedAt: price.pricedAt, lastKnown: false };
    entry.offers.push(modelPartOffer(choice, price.info));
    // The oldest price stands for the group, and any last-known one marks it.
    if (price.pricedAt < entry.pricedAt) entry.pricedAt = price.pricedAt;
    entry.lastKnown ||= price.lastKnown;
    byGenart.set(choice.genart_id, entry);
  }
  for (const [genartId, entry] of byGenart) {
    result.set(genartId, { state: "ok", offers: entry.offers, pricedAt: entry.pricedAt, lastKnown: entry.lastKnown });
  }
  return result;
}
