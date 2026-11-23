// Price a car's parts as soon as it is identified (2026-11-18).
//
// NAPA can take several seconds per part type on a car's first visit. Brad:
// "should we start the napa search at the same time we run through dvla so
// the search is done by the time we get to the repairs list?" So when a
// registration is looked up (website and app), every part type the car's
// VISIBLE repairs charge for is asked of NAPA in the background, through the
// customers' own price cache (aag-part-prices.ts). By the time the customer
// has confirmed the car and opened the repair list, the answers are stored,
// and the list prices from them at once.
//
// What is asked: the part types the services offered for the car's fuel buy
// (Task 83: filters and plugs), then the car's whole HaynesPro tree (about 3 calls: getFullTree,
// then getRepairtimeNodesV4 200 ids at a time, both memoised), less the
// repairs Gareth hid, Common jobs first. A part type is asked once however
// many repairs use it, ten at a time so NAPA is never flooded, and never
// again while its answer is fresh (12 hours). Read-only lookups only.
//
// Never throws and never holds up a response: callers run it inside `after()`.

import type { SupabaseClient } from "@supabase/supabase-js";

import { aagRegKey } from "@/lib/aag/client";
import { loadCatalogueProducts } from "@/lib/catalogue/load-products";
import { productsForFuel } from "@/lib/catalogue/products";
import { servicePartTypes } from "@/lib/catalogue/service-parts";
import { vehicleFuelFamily } from "@/lib/haynespro/fuel";
import { excludedRepairNodeIdsForVehicle, NO_EXCLUSIONS } from "@/lib/haynespro/exclusions";
import { getFullRepairTree, getRepairNodesByIds } from "@/lib/haynespro/tree";
import type { HpRepairtimeNode } from "@/lib/haynespro/types";
import { resolveVehicle } from "@/lib/haynespro/vehicle";
import { loadAagPartOffers } from "./aag-part-prices";
import { isVisible, scannedRepairs, treeRepairIds, type ScannedRepair } from "./model-scan";

/** getRepairtimeNodesV4 takes up to 200 ids a call. */
const NODES_PER_CALL = 200;
/** Part types asked of NAPA at once. */
const GENARTS_PER_BATCH = 10;
/** A registration warmed on this server isn't warmed again for this long. */
const REWARM_MS = 10 * 60 * 1000;

const warmedAt = new Map<string, number>();

/** HaynesPro's "Common jobs" groups end in GCJ: what customers open most, so asked first. */
function isCommonJob(repair: Pick<ScannedRepair, "path">): boolean {
  return repair.path.some((p) => /GCJ$/i.test(p.id) || /^common jobs$/i.test(p.name));
}

/**
 * The part types to ask about, in the order to ask: those of Common jobs
 * first, then the rest as HaynesPro lists them. Each once. Pure.
 */
export function partTypesToWarm(repairs: readonly ScannedRepair[]): number[] {
  const ordered = [...repairs.filter(isCommonJob), ...repairs.filter((r) => !isCommonJob(r))];
  return [...new Set(ordered.flatMap((r) => r.groups.map((g) => g.genartId)))];
}

/** Ask NAPA for every part type the car's visible repairs charge for. Never throws. */
export async function warmVehicleParts(db: SupabaseClient, reg: string): Promise<{ partTypes: number } | null> {
  const key = aagRegKey(reg);
  if (!key) return null;
  const last = warmedAt.get(key);
  if (last && Date.now() - last < REWARM_MS) return null;
  warmedAt.set(key, Date.now());

  try {
    const vehicle = await resolveVehicle(key, db);
    if (!vehicle || vehicle.repairtimeTypeId == null) return null;
    const ref = { carTypeId: vehicle.carTypeId, repairtimeTypeId: vehicle.repairtimeTypeId };

    const tree = await getFullRepairTree(ref);
    if (tree.length === 0) return null;
    const ids = treeRepairIds(tree);
    const nodes = new Map<string, HpRepairtimeNode>();
    for (let i = 0; i < ids.length; i += NODES_PER_CALL) {
      for (const node of await getRepairNodesByIds(ref, ids.slice(i, i + NODES_PER_CALL))) {
        if (node.id) nodes.set(String(node.id), node);
      }
    }

    const [hidden, services] = await Promise.all([
      excludedRepairNodeIdsForVehicle(vehicle.hpModelLabel, db).catch(() => NO_EXCLUSIONS),
      servicePartTypesFor(db, vehicle.carTypeId),
    ]);
    const visible = scannedRepairs(tree, nodes).filter((r) => isVisible(r, hidden));
    const partTypes = [...new Set([...services, ...partTypesToWarm(visible)])];
    for (let i = 0; i < partTypes.length; i += GENARTS_PER_BATCH) {
      await loadAagPartOffers(db, key, partTypes.slice(i, i + GENARTS_PER_BATCH));
    }
    return { partTypes: partTypes.length };
  } catch (err) {
    console.error("[parts] warming", key, "failed:", err);
    warmedAt.delete(key);
    return null;
  }
}

/** The part types the live services offered for this car's fuel buy (Task 83). Never throws. */
async function servicePartTypesFor(db: SupabaseClient, carTypeId: number): Promise<number[]> {
  try {
    const [rows, fuel] = await Promise.all([loadCatalogueProducts(db), vehicleFuelFamily(carTypeId)]);
    const live = productsForFuel(rows.filter((row) => row.is_active), fuel);
    return [...new Set(live.flatMap((row) => servicePartTypes(row.part_genart_ids).map((t) => t.genartId)))];
  } catch {
    return [];
  }
}
