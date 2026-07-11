// Bookable HaynesPro repairs (Task 16 Stage G).
//
// A customer can pick a single repair operation from the HaynesPro tree for
// THEIR car and book it. The price is the operation's OEM book time billed in
// whole hours (round up, min 1h) × the global hourly rate — no parts line,
// commission comes out of the total exactly like a packaged service.
//
// The quote is re-derived SERVER-SIDE from (reg, nodeId) at every funnel step
// (match → slot → checkout hold → booking create) — the client never supplies
// a price or a duration. HaynesPro reads are memoised (lib/haynespro/tree.ts)
// and the vehicle resolution is cached per reg, so the steps price
// identically.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computePrice,
  getHourlyRatePence,
  getTakeRateBase,
  type PriceBreakdown,
} from "@/lib/pricing/calculate";
import { billableHours } from "@/lib/pricing/billable";
import { getRepairNodesByIds } from "./tree";
import { resolveVehicle } from "./vehicle";

/** Slug of the hidden container service repair bookings attach to (0038). */
export const REPAIR_CONTAINER_SLUG = "custom-repair";

export interface RepairQuote {
  nodeId: string;
  /** e.g. "Renew the front brake pads" — shown everywhere a service name is. */
  description: string;
  rawHours: number;
  billedHours: number;
  /** Full engine breakdown (durationSource='vehicle', raw hours attached). */
  breakdown: PriceBreakdown;
}

/**
 * Price a specific repair for a specific reg, or null when it can't be done
 * (unresolvable vehicle, unknown node, group node with no time, API down).
 */
export async function quoteRepair(
  reg: string,
  nodeId: string,
  db: SupabaseClient,
): Promise<RepairQuote | null> {
  try {
    if (!reg?.trim() || !nodeId?.trim()) return null;

    const vehicle = await resolveVehicle(reg, db);
    if (!vehicle || vehicle.repairtimeTypeId == null) return null;

    // Admin-hidden repairs aren't bookable even via a stale/crafted URL.
    // (Only the leaf itself is checked — ancestors aren't knowable from the
    // node id alone; hiding a group already removes the path to its leaves.)
    const { excludedRepairNodeIdsForVehicle } = await import("./exclusions");
    const excluded = await excludedRepairNodeIdsForVehicle(vehicle.hpModelLabel, db);
    if (excluded.has(nodeId)) return null;

    const nodes = await getRepairNodesByIds(vehicle.repairtimeTypeId, [nodeId]);
    const node = nodes.find((n) => n.id === nodeId) ?? nodes[0];
    if (!node || typeof node.value !== "number" || node.value <= 0) return null;

    const rawHours = node.value / 100;
    const billedHours = billableHours(rawHours);
    if (billedHours == null) return null;

    const [hourlyRatePence, commissionRate] = await Promise.all([
      getHourlyRatePence(db),
      getTakeRateBase(db),
    ]);

    const breakdown: PriceBreakdown = {
      ...computePrice({
        durationHours: billedHours,
        hourlyRatePence,
        partsPence: 0,
        commissionRate,
        areaId: null,
      }),
      durationSource: "vehicle",
      vehicleRawDurationHours: rawHours,
    };

    return {
      nodeId,
      description: node.description?.trim() || "Vehicle repair",
      rawHours,
      billedHours,
      breakdown,
    };
  } catch (err) {
    console.error("[haynespro] repair quote failed:", err);
    return null;
  }
}

/** The hidden container service's id (null when 0038 hasn't been applied). */
export async function repairContainerServiceId(
  db: SupabaseClient,
): Promise<string | null> {
  const { data } = await db
    .from("services")
    .select("id")
    .eq("slug", REPAIR_CONTAINER_SLUG)
    .maybeSingle();
  return data?.id ?? null;
}
