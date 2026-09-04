// Bookable HaynesPro repairs (Task 16 Stage G; the only booking type since
// Task 17 removed the packaged-services catalogue; several per booking since
// Task 24; combined repairs since Task 26).
//
// A customer picks one or more items from the catalogue for THEIR car and
// books them in one visit. An item is a HaynesPro repair operation, or one
// option of a combined repair the admin made ("Brake pads & discs · Front",
// id "b:<uuid>") which stands for several HaynesPro operations. The price is
// the jobs' OEM book time — each job's own time added up by default (owner
// decision 2026-09-04: "charge for both"), or HaynesPro's basket calculation
// with the overlap removed when the admin setting says so (see ./combine.ts
// and getRepairCombineMode) — min 1h applied ONCE to the whole booking, × the
// global hourly rate. No parts line; commission comes out of the total.
//
// The quote is re-derived SERVER-SIDE from (reg, ids) at every funnel step
// (match → slot → checkout hold → booking create) — the client never supplies
// a price or a duration. HaynesPro reads are memoised (lib/haynespro/tree.ts)
// and the vehicle resolution is cached per reg, so the steps price
// identically. A single plain job never calls the basket operation: its
// figures are exactly what they were before Task 24.

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
import { expandCatalogueItems, type CatalogueItem } from "@/lib/catalogue/overlay";
import type { CombinedRepairTimes } from "./combine";
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
  /** The HaynesPro job. */
  nodeId: string;
  description: string;
  /** The job's own book time, on its own. */
  rawHours: number;
  /** Its share after overlap removal — 0 when another job in the basket covers it. */
  chargedHours: number;
  /** chargedHours × rate. Informational: lines need not sum to the total (min 1h). */
  linePence: number;
  /** The chosen item this job came from — its own id, or the combined repair's option id. */
  itemId: string;
  /** The combined repair's display name; null for a job booked on its own. */
  itemLabel: string | null;
}

export interface RepairsQuote {
  /** The ids as chosen, deduped, in the customer's order — what URLs and bookings carry. */
  itemIds: string[];
  /** What each chosen id stands for. */
  items: CatalogueItem[];
  /** Every HaynesPro job in the booking, deduped, in order. */
  nodeIds: string[];
  lines: RepairQuoteLine[];
  /** "Renew the alternator" / "Brake pads & discs · Front" / "… + 2 more jobs" — what bookings.repair_description stores. */
  description: string;
  /** Book time for the whole visit (overlap removed, or the plain sum). */
  combinedRawHours: number;
  /** billableHours(combinedRawHours) — the 1h minimum, applied once. */
  billedHours: number;
  /** null for a single job. */
  combineSource: CombineSource | null;
  /** Full engine breakdown (durationSource='vehicle', combined raw hours attached). */
  breakdown: PriceBreakdown;
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
 * Turn resolved items (+ HaynesPro's basket reply, when there was one) into a
 * quote. Pure — unit-tested. `combined` is ignored for a single job, and a
 * basket that doesn't cover every job falls back to the plain sum.
 */
export function buildRepairsQuote(args: {
  items: readonly QuotableItem[];
  combined: CombinedRepairTimes | null;
  hourlyRatePence: number;
  commissionRate: number;
}): RepairsQuote | null {
  const { items, combined, hourlyRatePence, commissionRate } = args;

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
  if (nodes.length === 0) return null;

  let charged: number[];
  let combinedRawHours: number;
  let combineSource: CombineSource | null;

  if (nodes.length === 1) {
    charged = [nodes[0].rawHours];
    combinedRawHours = nodes[0].rawHours;
    combineSource = null;
  } else {
    const byId = combined ? new Map(combined.items.map((i) => [i.id, i])) : null;
    const complete = byId != null && nodes.every((n) => byId.has(n.id));
    if (combined && byId && complete) {
      charged = nodes.map((n) => byId.get(n.id)!.calculatedTime / 100);
      combinedRawHours = combined.totalRepairTime / 100;
      combineSource = "haynespro";
    } else {
      charged = nodes.map((n) => n.rawHours);
      combinedRawHours = round2(nodes.reduce((sum, n) => sum + n.rawHours, 0));
      combineSource = "sum";
    }
  }

  const billedHours = billableHours(combinedRawHours);
  if (billedHours == null) return null;

  const breakdown: PriceBreakdown = {
    ...computePrice({
      durationHours: billedHours,
      hourlyRatePence,
      partsPence: 0,
      commissionRate,
      areaId: null,
    }),
    durationSource: "vehicle",
    vehicleRawDurationHours: combinedRawHours,
  };

  const lines: RepairQuoteLine[] = nodes.map((n, i) => ({
    nodeId: n.id,
    description: n.description,
    rawHours: n.rawHours,
    chargedHours: round2(charged[i]),
    linePence: Math.round(round2(charged[i]) * hourlyRatePence),
    itemId: n.itemId,
    itemLabel: n.itemLabel,
  }));

  // The summary counts what the customer chose: a combined repair is one thing.
  const itemNames = items
    .filter((item) => item.nodes.length > 0)
    .map((item) => item.label ?? item.nodes[0].description);

  return {
    itemIds: items.map((item) => item.id),
    items: items.map((item) => ({ id: item.id, label: item.label, nodeIds: item.nodes.map((n) => n.id) })),
    nodeIds: nodes.map((n) => n.id),
    lines,
    description: repairSummary(itemNames),
    combinedRawHours,
    billedHours,
    combineSource,
    breakdown,
  };
}

/**
 * Price a set of chosen items for a specific reg, or null when it can't be
 * done (no ids, too many, unresolvable vehicle, an unknown / admin-hidden /
 * untimed job among them, a switched-off combined repair, API down).
 * All-or-nothing: one bad id refuses the lot, the same way the hold and the
 * booking insert re-quote.
 */
export async function quoteRepairs(
  reg: string,
  ids: readonly string[],
  db: SupabaseClient,
): Promise<RepairsQuote | null> {
  try {
    const itemIds = dedupeRepairIds(ids);
    if (!reg?.trim() || itemIds.length === 0 || itemIds.length > MAX_REPAIRS_PER_BOOKING) return null;

    const [vehicle, overlay] = await Promise.all([resolveVehicle(reg, db), loadCatalogueOverlay(db)]);
    if (!vehicle || vehicle.repairtimeTypeId == null) return null;

    const items = expandCatalogueItems(itemIds, overlay);
    if (!items) return null;
    const nodeIds = [...new Set(items.flatMap((item) => item.nodeIds))];
    if (nodeIds.length === 0 || nodeIds.length > MAX_JOBS_PER_BOOKING) return null;

    // Admin-hidden repairs aren't bookable even via a stale/crafted URL.
    // (Only the leaf itself is checked — ancestors aren't knowable from the
    // node id alone; hiding a group already removes the path to its leaves.)
    const excluded = await excludedRepairNodeIdsForVehicle(vehicle.hpModelLabel, db);
    if (nodeIds.some((id) => excluded.has(id))) return null;

    const nodes = await getRepairNodesByIds(vehicle.repairtimeTypeId, nodeIds);
    const byId = new Map(nodes.filter((n) => n.id != null).map((n) => [n.id as string, n]));
    const quotable = new Map<string, QuotableNode>();
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

    const [hourlyRatePence, commissionRate, combineMode] = await Promise.all([
      getHourlyRatePence(db),
      getTakeRateBase(db),
      getRepairCombineMode(db),
    ]);

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
