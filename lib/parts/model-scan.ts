// A model's whole repair list, scanned once, for the Parts gaps screen
// (Task 77).
//
// Gareth works through a model's gaps laid out the way HaynesPro lays out its
// repairs (Engine assembly > Cylinder head > repair), with the part types
// each visible repair still can't price and a part to choose for each. That
// needs the model's whole tree and the part types on every repair, which
// HaynesPro gives in about 12 calls (getFullTree, then getRepairtimeNodesV4
// 200 ids at a time). So a model is SCANNED once, through one registration,
// and kept in `model_part_scans` (migration 0090); the screen is drawn from
// that, with today's hides, NAPA answers and picks applied as it's drawn.
//
// Scanning also asks NAPA for every part type the repairs charge for, through
// the same code customers' quotes use (aag-part-prices.ts: the standard quote,
// the full catalogue, engine codes, approved code maps). Read-only lookups only.

import type { SupabaseClient } from "@supabase/supabase-js";

import { aagRegKey } from "@/lib/aag/client";
import { excludedRepairNodeIdsForVehicle, NO_EXCLUSIONS, type RepairExclusionSet } from "@/lib/haynespro/exclusions";
import { getFullRepairTree, getRepairNodesByIds, type HpFullTreeNode } from "@/lib/haynespro/tree";
import type { HpRepairtimeNode } from "@/lib/haynespro/types";
import { resolveVehicle } from "@/lib/haynespro/vehicle";
import { loadAagPartOffers, type AagPartOffers, type AagPartPriceRow } from "./aag-part-prices";
import type { ModelPartChoiceRow } from "./model-parts";
import { partGroupsOnNodes } from "./part-groups";
import { priceJobParts, type PartsJob } from "./quote-parts";
import { jobPosition } from "./repair-part-choice";
import type { PartPosition } from "./supplier-offer";

const TABLE = "model_part_scans";
/** getRepairtimeNodesV4 takes up to 200 ids a call. */
const NODES_PER_CALL = 200;
/** Part types asked of NAPA at once while scanning, so a scan never floods it. */
const GENARTS_PER_BATCH = 10;
/** Per NAPA call while scanning: nobody is waiting on a page, so allow NAPA time (customers get 4 s). */
const SCAN_TIMEOUT_MS = 15_000;

export interface ScannedRepair {
  id: string;
  name: string;
  /** The groups above it, top first: [{Engine assembly}, {Cylinder head}]. */
  path: Array<{ id: string; name: string }>;
  /** The part types it charges for (Task 73's rules already applied). */
  groups: Array<{ genartId: number; label: string }>;
}

/** A row of `model_part_scans` (migration 0090). */
export interface ModelScanRow {
  make_name: string;
  model_label: string;
  reg: string;
  car_type_id: number;
  vehicle: string | null;
  repairs: ScannedRepair[];
  scanned_at: string;
}

/**
 * The repairs that charge for parts, each with its place in the tree. A
 * repair listed under two groups is kept once, at its first place. Pure.
 */
export function scannedRepairs(
  tree: readonly HpFullTreeNode[],
  nodes: ReadonlyMap<string, HpRepairtimeNode>,
): ScannedRepair[] {
  const out: ScannedRepair[] = [];
  const seen = new Set<string>();
  const walk = (list: readonly HpFullTreeNode[] | null | undefined, path: ScannedRepair["path"]) => {
    for (const item of list ?? []) {
      if (item.nodes?.length) {
        walk(item.nodes, [...path, { id: item.id, name: item.desc }]);
        continue;
      }
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      const node = nodes.get(item.id);
      if (!node) continue;
      const groups = partGroupsOnNodes([node]).map((g) => ({
        genartId: g.genartId,
        label: g.description || `Part type ${g.genartId}`,
      }));
      if (groups.length === 0) continue;
      out.push({ id: item.id, name: node.description?.trim() || item.desc, path, groups });
    }
  };
  walk(tree, []);
  return out;
}

/** Every repair id in the tree, once. Pure. */
export function treeRepairIds(tree: readonly HpFullTreeNode[]): string[] {
  const ids = new Set<string>();
  const walk = (list: readonly HpFullTreeNode[] | null | undefined) => {
    for (const item of list ?? []) {
      if (item.nodes?.length) walk(item.nodes);
      else ids.add(item.id);
    }
  };
  walk(tree);
  return [...ids];
}

export type ScanResult =
  | { ok: true; scan: ModelScanRow; priced: number; partTypes: number }
  | { ok: false; error: string };

/**
 * Scan a model through one registration: HaynesPro's tree and part types,
 * saved, then NAPA asked for every part type. Never throws.
 */
export async function scanModel(db: SupabaseClient, reg: string, userId: string | null): Promise<ScanResult> {
  const vehicle = await resolveVehicle(reg, db).catch(() => null);
  if (!vehicle) return { ok: false, error: `We couldn't identify ${reg}. Check it and try again.` };
  if (vehicle.repairtimeTypeId == null) return { ok: false, error: "HaynesPro has no repair times for that car." };
  if (!vehicle.hpMake || !vehicle.hpModelLabel) return { ok: false, error: "HaynesPro didn't name that car's model." };
  const ref = { carTypeId: vehicle.carTypeId, repairtimeTypeId: vehicle.repairtimeTypeId };

  let repairs: ScannedRepair[];
  try {
    const tree = await getFullRepairTree(ref);
    if (tree.length === 0) return { ok: false, error: "HaynesPro didn't return that car's repairs. Try again in a minute." };
    const ids = treeRepairIds(tree);
    const nodes = new Map<string, HpRepairtimeNode>();
    for (let i = 0; i < ids.length; i += NODES_PER_CALL) {
      for (const node of await getRepairNodesByIds(ref, ids.slice(i, i + NODES_PER_CALL))) {
        if (node.id) nodes.set(String(node.id), node);
      }
    }
    repairs = scannedRepairs(tree, nodes);
  } catch {
    return { ok: false, error: "HaynesPro didn't answer. Try again in a minute." };
  }

  const scan: ModelScanRow = {
    make_name: vehicle.hpMake,
    model_label: vehicle.hpModelLabel,
    reg: vehicle.reg,
    car_type_id: vehicle.carTypeId,
    vehicle: vehicle.description,
    repairs,
    scanned_at: new Date().toISOString(),
  };
  const { error } = await db.from(TABLE).upsert({ ...scan, scanned_by: userId }, { onConflict: "make_name,model_label" });
  if (error) return { ok: false, error: `Couldn't save the scan: ${error.message}` };

  const priced = await priceScan(db, scan);
  return { ok: true, scan, ...priced };
}

/** Whether customers can see a repair: neither it nor a group above it is hidden. Pure. */
export function isVisible(
  repair: Pick<ScannedRepair, "id" | "name" | "path">,
  hidden: Pick<RepairExclusionSet, "has">,
): boolean {
  return !hidden.has(repair.id, repair.name) && !repair.path.some((p) => hidden.has(p.id, p.name));
}

/**
 * Ask NAPA (through the customers' price cache) for every part type the
 * model's VISIBLE repairs charge for. Hidden repairs aren't asked about: on
 * Gareth's live account, lookups for repairs nobody can book are waste.
 */
export async function priceScan(db: SupabaseClient, scan: Pick<ModelScanRow, "reg" | "model_label" | "repairs">) {
  const hidden = await excludedRepairNodeIdsForVehicle(scan.model_label, db).catch(() => NO_EXCLUSIONS);
  const visible = scan.repairs.filter((r) => isVisible(r, hidden));
  const ids = [...new Set(visible.flatMap((r) => r.groups.map((g) => g.genartId)))];
  let priced = 0;
  for (let i = 0; i < ids.length; i += GENARTS_PER_BATCH) {
    const load = await loadAagPartOffers(db, scan.reg, ids.slice(i, i + GENARTS_PER_BATCH), { timeoutMs: SCAN_TIMEOUT_MS });
    if (load.enabled) for (const answer of load.byGenart.values()) if (answer.state === "ok") priced++;
  }
  return { priced, partTypes: ids.length };
}

/** Every scan, newest first (repairs left out). */
export async function listScans(db: SupabaseClient): Promise<Array<Omit<ModelScanRow, "repairs">>> {
  const { data, error } = await db
    .from(TABLE)
    .select("make_name, model_label, reg, car_type_id, vehicle, scanned_at")
    .order("scanned_at", { ascending: false });
  return error ? [] : ((data ?? []) as Array<Omit<ModelScanRow, "repairs">>);
}

export async function loadScan(db: SupabaseClient, make: string, modelLabel: string): Promise<ModelScanRow | null> {
  const { data, error } = await db.from(TABLE).select("*").eq("make_name", make).eq("model_label", modelLabel).maybeSingle();
  return error ? null : ((data as ModelScanRow | null) ?? null);
}

/** NAPA's stored answers for a registration, as the pricing code reads them. */
export async function loadStoredAnswers(db: SupabaseClient, reg: string): Promise<Map<number, AagPartOffers>> {
  const answers = new Map<number, AagPartOffers>();
  const { data } = await db
    .from("aag_part_prices")
    .select("reg, genart_id, state, offers, fetched_at")
    .eq("reg", aagRegKey(reg));
  for (const row of (data ?? []) as AagPartPriceRow[]) {
    answers.set(
      row.genart_id,
      row.state === "ok"
        ? { state: "ok", offers: row.offers ?? [], pricedAt: row.fetched_at, lastKnown: false }
        : { state: "empty", pricedAt: row.fetched_at },
    );
  }
  return answers;
}

// --- The screen's view of a scan -------------------------------------------

export interface MissingPartView {
  genartId: number;
  label: string;
  position: PartPosition | null;
  /** NAPA hasn't been asked about it on the scanned car yet. */
  unchecked: boolean;
  /** The admin's pick for the model that covers it, if any. */
  pick: ModelPartChoiceRow | null;
}

export interface RepairView {
  id: string;
  name: string;
  path: ScannedRepair["path"];
  /** "priced": every part from NAPA or a set price. "gap": something isn't. */
  status: "priced" | "gap";
  missing: MissingPartView[];
}

/** Whether a pick covers a part on this axle: an axle pick, or one for any axle. */
function pickFor(
  picks: readonly ModelPartChoiceRow[],
  genartId: number,
  position: PartPosition | null,
): ModelPartChoiceRow | null {
  const forType = picks.filter((p) => p.genart_id === genartId);
  return forType.find((p) => p.position === position) ?? forType.find((p) => p.position == null) ?? null;
}

/**
 * Each visible repair's state on the scanned car, priced the way a customer's
 * quote is (priceJobParts: axles, kits, switched-off part types, set prices),
 * from NAPA's stored answers. A repair hidden for the model, or under a
 * hidden group, is left out. Pure.
 */
export function scanView(args: {
  repairs: readonly ScannedRepair[];
  hidden: Pick<RepairExclusionSet, "has">;
  answers: ReadonlyMap<number, AagPartOffers>;
  picks: readonly ModelPartChoiceRow[];
  uncharged?: ReadonlySet<number>;
  setPrices?: Parameters<typeof priceJobParts>[0]["setPrices"];
}): RepairView[] {
  const visible = args.repairs.filter((r) => isVisible(r, args.hidden));
  return visible.map((repair) => {
    const job: PartsJob = { nodeId: repair.id, description: repair.name, groups: repair.groups };
    const result = priceJobParts({
      jobs: [job],
      offers: args.answers,
      uncharged: args.uncharged,
      setPrices: args.setPrices,
    });
    const missing: MissingPartView[] = result.ok
      ? []
      : result.missing.map((m) => ({
          genartId: m.genartId,
          label: m.label,
          position: m.position ?? jobPosition(repair.name),
          unchecked: !args.answers.has(m.genartId),
          pick: pickFor(args.picks, m.genartId, m.position ?? jobPosition(repair.name)),
        }));
    return { id: repair.id, name: repair.name, path: repair.path, status: missing.length ? "gap" : "priced", missing };
  });
}
