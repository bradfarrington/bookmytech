// Repair availability (Task 16 Stage G follow-up; global scope and per-model
// overrides added in Task 23).
//
// Every repair-tree node is available on every vehicle by default. Admins
// curate with rows in repair_vehicle_exclusions, which come in three kinds:
//
//   ('*', '*',      node, 'hide')   hidden for ALL vehicles
//   (make, model,   node, 'hide')   hidden for that model
//   (make, model,   node, 'show')   shown on that model despite a global hide
//
// Effective hidden set for a vehicle =
//   (global hides − this model's 'show' rows) ∪ this model's 'hide' rows
//
// Per-model rows key on HaynesPro make/model NAMES (stable across their
// quarterly DB updates, unlike the numeric ids) and match the vehicle cache
// row's hp_model_label. Node ids are HaynesPro's structured AW position codes
// and mean the same job on every make — verified live 2026-09-04 with
// scripts/verify-repair-node-ids.mjs: "Renew the front brake pads" is
// 1M01510000WV0 on a Golf VII and on a Ranger, and looking the Ranger up by
// the Golf's id returns the same timed job.
//
// EXCEPT the variant ending (Task 77, found 2026-11-17). A job that comes in
// versions numbers them per car: 1E05001991WV1 is "Renew the starter motor
// Dual-clutch transmission" on one car and "… Manual transmission" on a 2010
// Fiesta. Hiding by id hid a different repair on other cars (418 across 11
// scanned models) and left the intended one showing where its number
// differed. So a hide on a variant id (…WV<n>) matches HaynesPro's job
// number (the id without the ending) plus the job's wording as saved with the
// hide; groups and ids without a variant ending still match by id.
//
// The customer repair browser and search hide the effective set once the reg
// resolves, and quoteRepair refuses to price a hidden leaf. Failure modes are
// deliberate: an unresolvable vehicle (empty label) still gets the global
// hides but no per-model rows; an unreadable table hides nothing.

import type { SupabaseClient } from "@supabase/supabase-js";

/** make_name and model_name of a row that applies to every vehicle. */
export const GLOBAL_SCOPE = "*";

export type ExclusionScope = "model" | "global";
export type ExclusionMode = "hide" | "show";

/** Uppercase + collapse whitespace so label comparison survives spacing/case drift. */
export function normaliseLabel(raw: string | null | undefined): string {
  return (raw ?? "").toUpperCase().replace(/\s+/g, " ").trim();
}

export interface RepairExclusionRow {
  node_id: string;
  make_name: string;
  model_name: string;
  /** Absent on rows read before migration 0054 — treated as 'hide'. */
  mode?: ExclusionMode | string | null;
  /** HaynesPro's own name for the node when it was hidden (0039). Matches variants (Task 77). */
  description?: string | null;
}

/** A HaynesPro variant ending: "…WV0", "…WV1". */
const VARIANT_ENDING = /WV\d+$/;

/** A job's wording for matching: no follow-up "*", case and spacing ignored. */
export function normaliseRepairWording(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\*/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}

/**
 * What a hide on this node matches by: HaynesPro's job number plus wording
 * for a variant id ("1E05001991|RENEW THE STARTER MOTOR MANUAL TRANSMISSION"),
 * null for a group or an id without a variant ending (matched by id). Pure.
 */
export function variantKey(nodeId: string, description: string | null | undefined): string | null {
  if (!VARIANT_ENDING.test(nodeId)) return null;
  const words = normaliseRepairWording(description);
  return words ? `${nodeId.replace(VARIANT_ENDING, "")}|${words}` : null;
}

/** A set of hides that answers for a node on a given car: its id and its wording there. */
export class NodeMatcher {
  private readonly ids = new Set<string>();
  private readonly keys = new Set<string>();
  /** Variant ids whose hide had no wording, or for checks made without it: matched by id. */
  private readonly variantIds = new Set<string>();

  add(nodeId: string, description: string | null | undefined): void {
    const key = variantKey(nodeId, description);
    if (key) {
      this.keys.add(key);
      this.variantIds.add(nodeId);
    } else {
      this.ids.add(nodeId);
    }
  }

  /**
   * Whether a node is covered, given HaynesPro's name for it on this car.
   * Without a name, a variant id falls back to matching by id, as before.
   */
  has(nodeId: string, description: string | null | undefined): boolean {
    if (this.ids.has(nodeId)) return true;
    const key = variantKey(nodeId, description);
    return key ? this.keys.has(key) : this.variantIds.has(nodeId);
  }

  get size(): number {
    return this.ids.size + this.keys.size;
  }
}

/** The hides that apply to one car: (global − this model's shows) ∪ this model's hides. */
export interface RepairExclusionSet {
  has(nodeId: string, description: string | null | undefined): boolean;
  readonly size: number;
}

export function isGlobalExclusionRow(
  row: Pick<RepairExclusionRow, "make_name" | "model_name">,
): boolean {
  return row.make_name === GLOBAL_SCOPE && row.model_name === GLOBAL_SCOPE;
}

function modeOf(row: Pick<RepairExclusionRow, "mode">): ExclusionMode {
  return row.mode === "show" ? "show" : "hide";
}

/** Partition of the rows that concern one model (identified by its normalised label). */
export interface ModelExclusionState {
  globalHidden: NodeMatcher;
  modelHidden: NodeMatcher;
  modelShown: NodeMatcher;
}

function partition(label: string, exclusions: RepairExclusionRow[]): ModelExclusionState {
  const state: ModelExclusionState = {
    globalHidden: new NodeMatcher(),
    modelHidden: new NodeMatcher(),
    modelShown: new NodeMatcher(),
  };
  for (const row of exclusions) {
    if (isGlobalExclusionRow(row)) {
      // A 'show' row can never be global — the action refuses to write one —
      // but if one ever appeared it must not hide anything.
      if (modeOf(row) === "hide") state.globalHidden.add(row.node_id, row.description);
      continue;
    }
    // Partial wildcards ('*', 'Golf') fall through here and match no label.
    if (!label || normaliseLabel(`${row.make_name} ${row.model_name}`) !== label) continue;
    (modeOf(row) === "show" ? state.modelShown : state.modelHidden).add(row.node_id, row.description);
  }
  return state;
}

function exclusionSet(state: ModelExclusionState): RepairExclusionSet {
  return {
    has: (nodeId, description) =>
      state.modelHidden.has(nodeId, description) ||
      (state.globalHidden.has(nodeId, description) && !state.modelShown.has(nodeId, description)),
    size: state.globalHidden.size + state.modelHidden.size,
  };
}

/** Hides nothing: for an unreadable table, or a context that has none. */
export const NO_EXCLUSIONS: RepairExclusionSet = { has: () => false, size: 0 };

/**
 * The hides for a vehicle whose cache row carries `modelLabel` (e.g.
 * "VOLKSWAGEN Golf IV (1J)"). Global hides apply whatever the label;
 * per-model rows only on an exact normalised match. Ask it with the node's
 * id AND HaynesPro's name for it on this car (variants, Task 77). Pure —
 * unit-tested.
 */
export function excludedRepairNodeIdsForLabel(
  modelLabel: string | null | undefined,
  exclusions: RepairExclusionRow[],
): RepairExclusionSet {
  return exclusionSet(partition(normaliseLabel(modelLabel), exclusions));
}

/**
 * The same partition, keyed by the make/model names the admin model page
 * holds — so the admin surface and the funnel agree on which rows apply
 * (both normalise; the page used to compare raw strings).
 */
export function exclusionStateForModel(
  exclusions: RepairExclusionRow[],
  makeName: string,
  modelName: string,
): ModelExclusionState {
  return partition(normaliseLabel(`${makeName} ${modelName}`), exclusions);
}

/** What one node's toggle should say on a model page. */
export type NodeAvailability =
  | "shown" //           default — no row applies
  | "hidden_model" //    this model's own 'hide' row
  | "hidden_global" //   hidden for all vehicles, no override here
  | "shown_override"; // hidden for all vehicles, but this model shows it

export function nodeAvailability(
  nodeId: string,
  description: string | null | undefined,
  state: ModelExclusionState,
): NodeAvailability {
  if (state.modelHidden.has(nodeId, description)) return "hidden_model";
  if (state.globalHidden.has(nodeId, description)) {
    return state.modelShown.has(nodeId, description) ? "shown_override" : "hidden_global";
  }
  return "shown";
}

export function isNodeVisible(availability: NodeAvailability): boolean {
  return availability === "shown" || availability === "shown_override";
}

/** PostgREST's default row cap, and the page size the whole-table read uses. */
const EXCLUSION_PAGE_SIZE = 1000;

/**
 * Every row of repair_vehicle_exclusions, read in pages. A plain select stops
 * at PostgREST's 1,000-row cap without saying so — past 1,000 hides (reached
 * 2026-10), whichever rows fell outside the first page were silently ignored:
 * hidden repairs showed to customers and the admin switch showed them on.
 * Throws on a read error; callers decide what that means.
 */
export async function loadRepairExclusionRows<T extends RepairExclusionRow = RepairExclusionRow>(
  db: SupabaseClient,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += EXCLUSION_PAGE_SIZE) {
    // "*" rather than naming `mode`: until migration 0054 is applied the column
    // does not exist, and asking for it would make Postgres fall back to the
    // mode() aggregate and error — which would switch every hide off. The
    // matcher treats a missing mode as 'hide', so per-model rows keep working
    // through the deploy window either way. Ordered by id so pages are stable.
    const { data, error } = await db
      .from("repair_vehicle_exclusions")
      .select("*")
      .order("id", { ascending: true })
      .range(from, from + EXCLUSION_PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < EXCLUSION_PAGE_SIZE) return rows;
  }
}

/**
 * The repair-tree node ids to hide for an already-resolved vehicle. Small
 * admin-curated table, read whole and matched in memory; never throws —
 * errors mean "hide nothing".
 */
export async function excludedRepairNodeIdsForVehicle(
  modelLabel: string | null | undefined,
  db: SupabaseClient,
): Promise<RepairExclusionSet> {
  try {
    return excludedRepairNodeIdsForLabel(modelLabel, await loadRepairExclusionRows(db));
  } catch (err) {
    console.error("[haynespro] repair exclusion lookup failed:", err);
    return NO_EXCLUSIONS;
  }
}
