// Bookable HaynesPro repairs (Task 16 Stage G; the only booking type since
// Task 17 removed the packaged-services catalogue; several per booking since
// Task 24; combined repairs since Task 26; fixed-price PRODUCTS — diagnostics,
// servicing, inspections — since Task 31).
//
// A customer picks one or more items from the catalogue for THEIR car and
// books them in one visit. An item is a HaynesPro repair operation, one
// option of a combined repair the admin made ("Brake pads & discs · Front",
// id "b:<uuid>") which stands for several HaynesPro operations, or a product
// ("p:<uuid>") the admin priced by hand. Jobs are priced from OEM book time —
// each job's own time added up by default (owner decision 2026-09-04: "charge
// for both"), or HaynesPro's basket calculation with the overlap removed when
// the admin setting says so (see ./combine.ts and getRepairCombineMode) — min
// 1h applied ONCE to the whole booking's hourly work, × the global hourly
// rate. A fixed-price product adds its price; a servicing product adds engine
// oil at £/litre × the vehicle's capacity (the booking's only parts line).
// Commission comes out of the total.
//
// The quote is re-derived SERVER-SIDE from (reg, ids) at every funnel step
// (match → slot → checkout hold → booking create) — the client never supplies
// a price or a duration. HaynesPro reads are memoised (lib/haynespro/tree.ts)
// and the vehicle resolution is cached per reg, so the steps price
// identically. A single plain job never calls the basket operation: its
// figures are exactly what they were before Task 24, and a booking with no
// products is priced exactly as it was before Task 31.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computePrice,
  getHourlyRatePence,
  getRepairCombineMode,
  getTakeRateBase,
  type PriceBreakdown,
} from "@/lib/pricing/calculate";
import { billableHours } from "@/lib/pricing/billable";
import { dedupeRepairIds, MAX_REPAIRS_PER_BOOKING } from "@/lib/bookings/repair-ids";
import { repairSummary } from "@/lib/bookings/repair-lines";
import { loadCatalogueOverlay } from "@/lib/catalogue/load-overlay";
import { loadCatalogueProducts } from "@/lib/catalogue/load-products";
import { expandCatalogueItems, type CatalogueItem } from "@/lib/catalogue/overlay";
import {
  isProductId,
  productUuid,
  resolveProducts,
  type OilQuote,
  type QuotableProduct,
} from "@/lib/catalogue/products";
import type { CombinedRepairTimes } from "./combine";
import { engineOilForVehicle } from "./engine-oil";
import { excludedRepairNodeIdsForVehicle } from "./exclusions";
import { combineRepairTimes, getRepairNodesByIds } from "./tree";
import { resolveVehicle } from "./vehicle";

/** A combined repair may expand a booking well past the item cap; this bounds the jobs. */
export const MAX_JOBS_PER_BOOKING = MAX_REPAIRS_PER_BOOKING * 2;

/**
 * How a multi-job booking's time was derived: "sum" = each job's book time
 * added up (the default), "haynespro" = the basket calculation with the
 * overlap removed (admin setting; also what a failed basket call falls back
 * from, to "sum").
 */
export type CombineSource = "haynespro" | "sum";

export interface RepairQuoteLine {
  /** The HaynesPro job — or "p:<uuid>" for a product line (Task 31). */
  nodeId: string;
  description: string;
  /** The job's own book time, on its own. A fixed-price product's is 0. */
  rawHours: number;
  /** Its share after overlap removal — 0 when another job in the basket covers it. */
  chargedHours: number;
  /** chargedHours × rate — or the product's own price. Informational: lines need not sum to the total (min 1h, oil). */
  linePence: number;
  /** The chosen item this job came from — its own id, or the combined repair's option id. */
  itemId: string;
  /** The combined repair's display name; null for a job booked on its own. */
  itemLabel: string | null;
  /** ADDITIVE (Task 31): what the line is. Absent = a HaynesPro job. */
  kind?: "job" | "product";
  productId?: string;
}

export interface RepairsQuote {
  /** The ids as chosen, deduped, in the customer's order — what URLs and bookings carry. */
  itemIds: string[];
  /** What each chosen HaynesPro-backed id stands for (products are in `products`). */
  items: CatalogueItem[];
  /** Every HaynesPro job in the booking, deduped, in order. Empty for a products-only booking. */
  nodeIds: string[];
  lines: RepairQuoteLine[];
  /** "Renew the alternator" / "Brake pads & discs · Front" / "… + 2 more jobs" — what bookings.repair_description stores. */
  description: string;
  /** Book time for the hourly work (overlap removed, or the plain sum) — jobs plus hourly products. */
  combinedRawHours: number;
  /** billableHours(combinedRawHours) — the 1h minimum, applied once; 0 when there is no hourly work. */
  billedHours: number;
  /** null for a single job. */
  combineSource: CombineSource | null;
  /** Full engine breakdown (durationSource='vehicle', combined raw hours attached; durationHours = the whole visit). */
  breakdown: PriceBreakdown;
  // --- Products (Task 31). ADDITIVE. ---
  /** The chosen products, in order. */
  products: QuotableProduct[];
  /** billedHours × rate. */
  labourPence: number;
  /** The fixed-price products' prices added up. */
  fixedPence: number;
  /** The engine-oil line, when a servicing product is in the booking (= breakdown.partsPence). */
  oil: OilQuote | null;
  /** Hours the visit is blocked out for: billed hours + fixed products' durations. */
  visitHours: number;
}

/** The pre-Task-24 single-repair quote. Unchanged shape; still what /api/mobile/v1/quote returns. */
export interface RepairQuote {
  nodeId: string;
  /** e.g. "Renew the front brake pads" — shown everywhere a service name is. */
  description: string;
  rawHours: number;
  billedHours: number;
  breakdown: PriceBreakdown;
}

export interface QuotableNode {
  id: string;
  description: string;
  rawHours: number;
}

export interface QuotableItem {
  id: string;
  label: string | null;
  nodes: QuotableNode[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Turn resolved items and products (+ HaynesPro's basket reply, when there
 * was one) into a quote. Pure — unit-tested. `combined` is ignored for a
 * single job, and a basket that doesn't cover every job falls back to the
 * plain sum. `order` is the customer's chosen order across items and
 * products (defaults to items first); `oil` is the vehicle's engine-oil
 * line, applied only when a product includes oil.
 */
export function buildRepairsQuote(args: {
  items: readonly QuotableItem[];
  products?: readonly QuotableProduct[];
  order?: readonly string[];
  oil?: OilQuote | null;
  combined: CombinedRepairTimes | null;
  hourlyRatePence: number;
  commissionRate: number;
}): RepairsQuote | null {
  const { items, combined, hourlyRatePence, commissionRate } = args;
  const products = args.products ?? [];

  // Flatten to jobs, deduping a job that two items both include.
  const nodes: Array<QuotableNode & { itemId: string; itemLabel: string | null }> = [];
  const seenNodes = new Set<string>();
  for (const item of items) {
    for (const node of item.nodes) {
      if (seenNodes.has(node.id)) continue;
      seenNodes.add(node.id);
      nodes.push({ ...node, itemId: item.id, itemLabel: item.label });
    }
  }
  if (nodes.length === 0 && products.length === 0) return null;

  // --- Hourly work: jobs (as before) + hourly products --------------------
  let charged: number[];
  let jobHours: number;
  let combineSource: CombineSource | null;

  if (nodes.length === 0) {
    charged = [];
    jobHours = 0;
    combineSource = null;
  } else if (nodes.length === 1) {
    charged = [nodes[0].rawHours];
    jobHours = nodes[0].rawHours;
    combineSource = null;
  } else {
    const byId = combined ? new Map(combined.items.map((i) => [i.id, i])) : null;
    const complete = byId != null && nodes.every((n) => byId.has(n.id));
    if (combined && byId && complete) {
      charged = nodes.map((n) => byId.get(n.id)!.calculatedTime / 100);
      jobHours = combined.totalRepairTime / 100;
      combineSource = "haynespro";
    } else {
      charged = nodes.map((n) => n.rawHours);
      jobHours = round2(nodes.reduce((sum, n) => sum + n.rawHours, 0));
      combineSource = "sum";
    }
  }

  const productHours = products.reduce((sum, p) => sum + (p.labourHours ?? 0), 0);
  const combinedRawHours = round2(jobHours + productHours);
  // The 1-hour minimum applies once to the visit's hourly work — and only
  // when there is some. A £59.99 diagnostic on its own is £59.99, not 1h × rate.
  const billedHours = combinedRawHours > 0 ? (billableHours(combinedRawHours) ?? 0) : 0;
  if (combinedRawHours > 0 && billedHours === 0) return null;

  // --- Products ------------------------------------------------------------
  // A line's own figure: the fixed price, or the hourly product's own hours ×
  // rate (its share of the visit — the 1-hour minimum is applied once to the
  // whole visit above, exactly as a job line's linePence is chargedHours × rate).
  const productPrices = new Map<string, number>();
  for (const product of products) {
    if (product.pricePence == null && product.labourHours == null) return null;
    productPrices.set(
      product.id,
      product.pricePence != null ? product.pricePence : Math.round((product.labourHours ?? 0) * hourlyRatePence),
    );
  }
  const fixedProducts = products.filter((p) => p.pricePence != null);
  const fixedPence = fixedProducts.reduce((sum, p) => sum + (p.pricePence ?? 0), 0);
  const oil = products.some((p) => p.includesEngineOil) && args.oil && args.oil.pence > 0 ? args.oil : null;
  const oilPence = oil?.pence ?? 0;
  const labourPence = Math.round(billedHours * hourlyRatePence);
  const visitHours = round2(billedHours + fixedProducts.reduce((sum, p) => sum + p.durationHours, 0));

  // With no products this is bit-for-bit the pre-Task-31 arithmetic:
  // base = billed hours × rate, no parts line.
  const breakdown: PriceBreakdown = {
    ...computePrice({
      durationHours: visitHours,
      hourlyRatePence,
      ...(products.length > 0 ? { overridePricePence: labourPence + fixedPence } : {}),
      partsPence: oilPence,
      commissionRate,
      areaId: null,
    }),
    durationSource: "vehicle",
    vehicleRawDurationHours: combinedRawHours,
  };

  // --- Lines, in the customer's order ---------------------------------------
  const jobLines = new Map<string, RepairQuoteLine[]>();
  nodes.forEach((n, i) => {
    const line: RepairQuoteLine = {
      nodeId: n.id,
      description: n.description,
      rawHours: n.rawHours,
      chargedHours: round2(charged[i]),
      linePence: Math.round(round2(charged[i]) * hourlyRatePence),
      itemId: n.itemId,
      itemLabel: n.itemLabel,
    };
    const list = jobLines.get(n.itemId) ?? [];
    list.push(line);
    jobLines.set(n.itemId, list);
  });
  const productById = new Map(products.map((p) => [p.id, p]));
  const defaultOrder = [...items.map((i) => i.id), ...products.map((p) => p.id)];
  const order = dedupeRepairIds(args.order ?? defaultOrder).filter(
    (id) => jobLines.has(id) || productById.has(id),
  );
  for (const id of defaultOrder) if (!order.includes(id) && (jobLines.has(id) || productById.has(id))) order.push(id);

  const lines: RepairQuoteLine[] = [];
  const itemNames: string[] = [];
  for (const id of order) {
    const product = productById.get(id);
    if (product) {
      lines.push({
        nodeId: product.id,
        description: product.name,
        rawHours: product.labourHours ?? 0,
        chargedHours: product.labourHours ?? 0,
        linePence: productPrices.get(product.id) ?? 0,
        itemId: product.id,
        itemLabel: null,
        kind: "product",
        productId: productUuid(product.id),
      });
      itemNames.push(product.name);
      continue;
    }
    const jobs = jobLines.get(id) ?? [];
    lines.push(...jobs);
    // The summary counts what the customer chose: a combined repair is one thing.
    const item = items.find((i) => i.id === id);
    if (item && jobs.length > 0) itemNames.push(item.label ?? jobs[0].description);
  }

  return {
    itemIds: order,
    items: items.map((item) => ({ id: item.id, label: item.label, nodeIds: item.nodes.map((n) => n.id) })),
    nodeIds: nodes.map((n) => n.id),
    lines,
    description: repairSummary(itemNames),
    combinedRawHours,
    billedHours,
    combineSource,
    breakdown,
    products: [...products],
    labourPence,
    fixedPence,
    oil,
    visitHours,
  };
}

/**
 * Price a set of chosen items for a specific reg, or null when it can't be
 * done (no ids, too many, unresolvable vehicle, an unknown / admin-hidden /
 * untimed job among them, a switched-off combined repair or product, API
 * down). All-or-nothing: one bad id refuses the lot, the same way the hold
 * and the booking insert re-quote.
 */
export async function quoteRepairs(
  reg: string,
  ids: readonly string[],
  db: SupabaseClient,
): Promise<RepairsQuote | null> {
  try {
    const itemIds = dedupeRepairIds(ids);
    if (!reg?.trim() || itemIds.length === 0 || itemIds.length > MAX_REPAIRS_PER_BOOKING) return null;
    const productIds = itemIds.filter(isProductId);
    const catalogueIds = itemIds.filter((id) => !isProductId(id));

    const [vehicle, overlay, productRows] = await Promise.all([
      resolveVehicle(reg, db),
      loadCatalogueOverlay(db),
      productIds.length ? loadCatalogueProducts(db) : Promise.resolve([]),
    ]);
    if (!vehicle || vehicle.repairtimeTypeId == null) return null;

    const products = productIds.length ? resolveProducts(productIds, productRows) : [];
    if (!products) return null;
    const items = catalogueIds.length ? expandCatalogueItems(catalogueIds, overlay) : [];
    if (!items) return null;
    if (items.length === 0 && products.length === 0) return null;

    const nodeIds = [...new Set(items.flatMap((item) => item.nodeIds))];
    if (nodeIds.length > MAX_JOBS_PER_BOOKING) return null;

    const quotable = new Map<string, QuotableNode>();
    if (nodeIds.length > 0) {
      // Admin-hidden repairs aren't bookable even via a stale/crafted URL.
      // (Only the leaf itself is checked — ancestors aren't knowable from the
      // node id alone; hiding a group already removes the path to its leaves.)
      const excluded = await excludedRepairNodeIdsForVehicle(vehicle.hpModelLabel, db);
      if (nodeIds.some((id) => excluded.has(id))) return null;

      const nodes = await getRepairNodesByIds(vehicle.repairtimeTypeId, nodeIds);
      const byId = new Map(nodes.filter((n) => n.id != null).map((n) => [n.id as string, n]));
      for (const id of nodeIds) {
        // A single-id reply whose item carries no id is tolerated, as it always was.
        const node = byId.get(id) ?? (nodeIds.length === 1 && nodes.length === 1 ? nodes[0] : undefined);
        if (!node || typeof node.value !== "number" || node.value <= 0) return null;
        quotable.set(id, {
          id,
          description: node.description?.trim() || "Vehicle repair",
          rawHours: node.value / 100,
        });
      }
    }

    const [hourlyRatePence, commissionRate, combineMode] = await Promise.all([
      getHourlyRatePence(db),
      getTakeRateBase(db),
      getRepairCombineMode(db),
    ]);

    // The engine-oil line, only when a servicing product asks for it.
    const oil = products.some((p) => p.includesEngineOil)
      ? await engineOilForVehicle(vehicle.carTypeId, db)
      : null;

    // The basket calculation is only asked for when the admin has opted into
    // overlap removal; otherwise buildRepairsQuote adds the book times.
    const combined =
      nodeIds.length > 1 && combineMode === "haynespro"
        ? await combineRepairTimes(vehicle.repairtimeTypeId, nodeIds, hourlyRatePence)
        : null;

    return buildRepairsQuote({
      items: items.map((item) => ({
        id: item.id,
        label: item.label,
        nodes: item.nodeIds.map((id) => quotable.get(id)!),
      })),
      products,
      order: itemIds,
      oil,
      combined,
      hourlyRatePence,
      commissionRate,
    });
  } catch (err) {
    console.error("[haynespro] repairs quote failed:", err);
    return null;
  }
}

/**
 * Price a single item — the pre-Task-24 entry point, kept for every caller
 * and for /api/mobile/v1/quote. A plain job gives the same numbers as before;
 * a combined repair's option comes back as one line with its display name.
 */
export async function quoteRepair(
  reg: string,
  id: string,
  db: SupabaseClient,
): Promise<RepairQuote | null> {
  if (!id?.trim()) return null;
  const quote = await quoteRepairs(reg, [id], db);
  if (!quote) return null;
  const line = quote.lines[0];
  return {
    nodeId: line.nodeId,
    description: quote.lines.length > 1 ? quote.description : line.description,
    rawHours: quote.combinedRawHours,
    billedHours: quote.billedHours,
    breakdown: quote.breakdown,
  };
}
