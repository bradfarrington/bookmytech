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
  globalHidden: Set<string>;
  modelHidden: Set<string>;
  modelShown: Set<string>;
}

function partition(label: string, exclusions: RepairExclusionRow[]): ModelExclusionState {
  const state: ModelExclusionState = {
    globalHidden: new Set(),
    modelHidden: new Set(),
    modelShown: new Set(),
  };
  for (const row of exclusions) {
    if (isGlobalExclusionRow(row)) {
      // A 'show' row can never be global — the action refuses to write one —
      // but if one ever appeared it must not hide anything.
      if (modeOf(row) === "hide") state.globalHidden.add(row.node_id);
      continue;
    }
    // Partial wildcards ('*', 'Golf') fall through here and match no label.
    if (!label || normaliseLabel(`${row.make_name} ${row.model_name}`) !== label) continue;
    (modeOf(row) === "show" ? state.modelShown : state.modelHidden).add(row.node_id);
  }
  return state;
}

/**
 * Repair-tree node ids hidden for a vehicle whose cache row carries
 * `modelLabel` (e.g. "VOLKSWAGEN Golf IV (1J)"). Global hides apply whatever
 * the label; per-model rows only on an exact normalised match. Pure —
 * unit-tested.
 */
export function excludedRepairNodeIdsForLabel(
  modelLabel: string | null | undefined,
  exclusions: RepairExclusionRow[],
): Set<string> {
  const { globalHidden, modelHidden, modelShown } = partition(
    normaliseLabel(modelLabel),
    exclusions,
  );
  const excluded = new Set<string>();
  for (const id of globalHidden) if (!modelShown.has(id)) excluded.add(id);
  for (const id of modelHidden) excluded.add(id);
  return excluded;
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
  state: ModelExclusionState,
): NodeAvailability {
  if (state.modelHidden.has(nodeId)) return "hidden_model";
  if (state.globalHidden.has(nodeId)) {
    return state.modelShown.has(nodeId) ? "shown_override" : "hidden_global";
  }
  return "shown";
}

export function isNodeVisible(availability: NodeAvailability): boolean {
  return availability === "shown" || availability === "shown_override";
}

/**
 * The repair-tree node ids to hide for an already-resolved vehicle. Small
 * admin-curated table, read whole and matched in memory; never throws —
 * errors mean "hide nothing".
 */
export async function excludedRepairNodeIdsForVehicle(
  modelLabel: string | null | undefined,
  db: SupabaseClient,
): Promise<Set<string>> {
  try {
    // "*" rather than naming `mode`: until migration 0054 is applied the column
    // does not exist, and asking for it would make Postgres fall back to the
    // mode() aggregate and error — which would switch every hide off. The
    // matcher treats a missing mode as 'hide', so per-model rows keep working
    // through the deploy window either way.
    const { data: rows } = await db.from("repair_vehicle_exclusions").select("*");
    return excludedRepairNodeIdsForLabel(modelLabel, (rows ?? []) as RepairExclusionRow[]);
  } catch (err) {
    console.error("[haynespro] repair exclusion lookup failed:", err);
    return new Set();
  }
}
