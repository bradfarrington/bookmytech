// HaynesPro identification tree + admin Vehicles data (Task 16 Stage E).
//
// The admin Vehicles area browses HaynesPro's ROOT → MAKE → MODEL → TYPE tree
// (filter_category=PASSENGER — cars; vans/trucks are separate categories) and
// pulls per-type technical data: repair-times tree, repair manuals (stories),
// adjustments, capacities and ID locations.
//
// Everything is memoised in-memory with a TTL: the tree barely changes between
// HaynesPro's quarterly database updates, and one admin page view would
// otherwise fan out into a dozen identical upstream calls. Serverless
// instances each hold their own memo — that's fine, it's only a warm cache.
//
// All lookups return null/[] on any failure — admin pages render an empty
// state instead of erroring.

import { haynesProCall } from "./client";
import { parseProcessRepairTasks, type CombinedRepairTimes } from "./combine";
import type {
  HpAdjustment,
  HpRepairtimeNode,
  HpStoryInfo,
  HpStoryOverviewItem,
  HpTreeNode,
  HpRepairtimeType,
} from "./types";

const TREE_TTL_MS = 24 * 60 * 60 * 1000; // identification tree: ~daily
const DATA_TTL_MS = 60 * 60 * 1000; //      per-type technical data: ~hourly

const memo = new Map<string, { expires: number; value: unknown }>();

async function memoised<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = memo.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  const value = await load();
  // Don't cache failures — a HaynesPro blip shouldn't stick for the whole TTL.
  if (value != null) memo.set(key, { expires: Date.now() + ttlMs, value });
  return value;
}

// ---------------------------------------------------------------------------
// Identification tree.
// ---------------------------------------------------------------------------

async function treeCall(params: Record<string, unknown>): Promise<HpTreeNode | null> {
  return haynesProCall<HpTreeNode>("getIdentificationTreeV2", {
    descriptionLanguage: "en",
    filter_category: "PASSENGER",
    ...params,
  });
}

/** All car makes (~88), alphabetical. */
export async function getMakes(): Promise<HpTreeNode[]> {
  const root = await memoised("makes", TREE_TTL_MS, () =>
    treeCall({ vehicle_level: "ROOT", filter_toVehicleLevel: "MAKE" }),
  );
  return root?.subElements ?? [];
}

/** A make node with its models (name, production years, car image). */
export async function getMakeWithModels(makeId: number): Promise<HpTreeNode | null> {
  return memoised(`make:${makeId}`, TREE_TTL_MS, () =>
    treeCall({
      vehicle_id: makeId,
      vehicle_level: "MAKE",
      filter_toVehicleLevel: "MODEL",
    }),
  );
}

/** A model node with its engine-variant types. */
export async function getModelWithTypes(modelId: number): Promise<HpTreeNode | null> {
  return memoised(`model:${modelId}`, TREE_TTL_MS, () =>
    treeCall({
      vehicle_id: modelId,
      vehicle_level: "MODEL",
      filter_toVehicleLevel: "TYPE",
    }),
  );
}

/**
 * One TYPE node by its car-type id — the level the price depends on. Carries
 * `fullName` ("FORD Ranger 2.0 EcoBlue"), `name` ("2.0 EcoBlue") and
 * `superElementId` (its MODEL), which is how a manually chosen type is turned
 * into a complete cache row (lib/haynespro/vehicle-picker.ts).
 *
 * Verified live 2026-09-01. Two things to know:
 *
 *  - **Ids are namespaced per level.** `vehicle_id=270` is FORD at MAKE level
 *    and an "ALFA ROMEO 33 (905) 1.7 8V QV" at TYPE level. So this must only
 *    ever be called with an id the caller believes is a TYPE, and the node it
 *    returns — not the id it was asked about — is the authority on what the
 *    vehicle actually is.
 *  - **Not-found is HTTP 200.** An unknown id (or a MAKE/MODEL id asked for at
 *    TYPE level) comes back as an all-null node with `status.statusCode 6`
 *    ("Vehicle not found"), which `haynesProCall` passes through unchanged. So
 *    a null `id` is the miss, and returning null for it also keeps `memoised`
 *    from caching a miss for a day.
 */
export async function getCarTypeNode(carTypeId: number): Promise<HpTreeNode | null> {
  return memoised(`type:${carTypeId}`, TREE_TTL_MS, async () => {
    const node = await treeCall({
      vehicle_id: carTypeId,
      vehicle_level: "TYPE",
      filter_toVehicleLevel: "TYPE",
    });
    return node?.id == null ? null : node;
  });
}

/**
 * Filename slug for the bundled brand logo pack (`public/brands/<slug>.png`).
 * Must stay in sync with the pack's generator: lowercase ASCII, runs of
 * non-alphanumerics collapsed to "-".
 */
export function brandLogoSlug(makeName: string): string {
  return makeName
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// Per-type technical data (model page panels).
// ---------------------------------------------------------------------------

/** The repair-times dataset id for a car type (null = no coverage). */
export async function getRepairtimeTypeId(carTypeId: number): Promise<number | null> {
  return memoised(`rtid:${carTypeId}`, DATA_TTL_MS, async () => {
    const types = await haynesProCall<HpRepairtimeType[]>("getRepairtimeTypesV2", {
      descriptionLanguage: "en",
      carTypeId,
    });
    for (const t of types ?? []) {
      if (t.repairtimeTypeId != null) return t.repairtimeTypeId;
    }
    return null;
  });
}

/** One level of the repair-times tree ("root" = top-level groups). */
export async function getRepairtimeSubnodes(
  repairtimeTypeId: number,
  nodeId: string,
): Promise<HpRepairtimeNode[]> {
  const nodes = await memoised(`rtnodes:${repairtimeTypeId}:${nodeId}`, DATA_TTL_MS, () =>
    haynesProCall<HpRepairtimeNode[]>("getRepairtimeSubnodesByGroupV4", {
      descriptionLanguage: "en",
      repairtimeTypeId,
      typeCategory: "CAR",
      nodeId,
    }),
  );
  return nodes ?? [];
}

/** Specific repair-time nodes by id (used to re-price a chosen repair). */
export async function getRepairNodesByIds(
  repairtimeTypeId: number,
  nodeIds: string[],
): Promise<HpRepairtimeNode[]> {
  const key = `rtbyid:${repairtimeTypeId}:${[...nodeIds].sort().join(",")}`;
  const nodes = await memoised(key, DATA_TTL_MS, () =>
    haynesProCall<HpRepairtimeNode[]>("getRepairtimeNodesV4", {
      descriptionLanguage: "en",
      repairtimeTypeId,
      typeCategory: "CAR",
      nodesIds: nodeIds,
    }),
  );
  return nodes ?? [];
}

/**
 * HaynesPro's basket calculation for several repairs at once (Task 24):
 * each job's time after overlap removal, and the total. Null on any failure
 * so the caller falls back to a plain sum — the funnel never blocks on it.
 *
 * The labour rate is required by the operation (it prices the basket too) but
 * only the times are used, which is why the rate is NOT part of the memo key:
 * a rate change mid-hour still re-prices correctly because the money comes
 * from lib/pricing/calculate.ts, never from HaynesPro's subtotal.
 */
export async function combineRepairTimes(
  repairtimeTypeId: number,
  nodeIds: readonly string[],
  labourRatePence: number,
): Promise<CombinedRepairTimes | null> {
  const ids = [...new Set(nodeIds)];
  if (ids.length < 2) return null;
  const key = `rtcombine:${repairtimeTypeId}:${[...ids].sort().join(",")}`;
  return memoised(key, DATA_TTL_MS, async () => {
    const rate = Math.max(0, Math.round(labourRatePence));
    const payload = await haynesProCall<unknown>("processRepairTasksV4", {
      descriptionLanguage: "en",
      repairtimeTypeId,
      typeCategory: "CAR",
      repairTaskIds: ids,
      repairVatRates: ids.map(() => 20),
      labourRateMechanical: rate,
      labourRateBody: rate,
      labourRateElectronics: rate,
    });
    return parseProcessRepairTasks(payload, ids);
  });
}

/** Repair manuals available for the car type. */
export async function getStoryList(carTypeId: number): Promise<HpStoryOverviewItem[]> {
  const stories = await memoised(`stories:${carTypeId}`, DATA_TTL_MS, () =>
    haynesProCall<HpStoryOverviewItem[]>("getStoryOverview", {
      descriptionLanguage: "en",
      carType: carTypeId,
    }),
  );
  return (stories ?? []).filter((s) => s.storyId != null && s.storyId !== 0);
}

/** One manual's full body (nested lines + image URLs). */
export async function getStory(
  carTypeId: number,
  storyId: number,
): Promise<HpStoryInfo | null> {
  return memoised(`story:${carTypeId}:${storyId}`, DATA_TTL_MS, () =>
    haynesProCall<HpStoryInfo>("getStoryInfoV6", {
      descriptionLanguage: "en",
      carTypeId,
      storyId,
      smartLinks: false,
    }),
  );
}

/** Adjustments (torque settings, specs) — recursive name/value/unit rows. */
export async function getAdjustments(carTypeId: number): Promise<HpAdjustment[]> {
  const rows = await memoised(`adjustments:${carTypeId}`, DATA_TTL_MS, () =>
    haynesProCall<HpAdjustment[]>("getAdjustmentsV7", {
      descriptionLanguage: "en",
      carType: carTypeId,
    }),
  );
  return rows ?? [];
}

/** Lubricant capacities — same recursive shape as adjustments. */
export async function getCapacities(carTypeId: number): Promise<HpAdjustment[]> {
  const row = await memoised(`capacities:${carTypeId}`, DATA_TTL_MS, () =>
    haynesProCall<HpAdjustment>("getLubricantCapacitiesV4", {
      descriptionLanguage: "en",
      carType: carTypeId,
    }),
  );
  return row ? [row] : [];
}

/** VIN/ID plate locations — story-shaped with photos. */
export async function getIdLocations(carTypeId: number): Promise<HpStoryInfo[]> {
  const rows = await memoised(`idloc:${carTypeId}`, DATA_TTL_MS, () =>
    haynesProCall<HpStoryInfo[]>("getIdLocationV3", {
      descriptionLanguage: "en",
      carTypeId,
      carTypeLevel: 3, // TYPE
    }),
  );
  return rows ?? [];
}
