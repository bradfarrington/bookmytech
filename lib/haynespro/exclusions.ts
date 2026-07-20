// Per-vehicle repair availability (Task 16 Stage G follow-up).
//
// Every repair is available on every vehicle by default. The admin can switch
// a repair-tree node (a group or a single timed repair) OFF for a specific
// model (repair_vehicle_exclusions, keyed on HaynesPro make/model NAMES —
// stable across their quarterly DB updates, unlike the numeric ids). The
// customer repair browser hides excluded nodes once the reg resolves, and
// quoteRepair refuses to price an excluded leaf; any failure to resolve
// matches nothing, so unknown vehicles always see the full tree.

import type { SupabaseClient } from "@supabase/supabase-js";

/** Uppercase + collapse whitespace so label comparison survives spacing/case drift. */
export function normaliseLabel(raw: string | null | undefined): string {
  return (raw ?? "").toUpperCase().replace(/\s+/g, " ").trim();
}

export interface RepairExclusionRow {
  node_id: string;
  make_name: string;
  model_name: string;
}

/**
 * Repair-tree node ids excluded for a vehicle whose cache row carries
 * `modelLabel` (e.g. "VOLKSWAGEN Golf IV (1J)"). Pure — unit-tested.
 */
export function excludedRepairNodeIdsForLabel(
  modelLabel: string | null | undefined,
  exclusions: RepairExclusionRow[],
): Set<string> {
  const excluded = new Set<string>();
  const label = normaliseLabel(modelLabel);
  if (!label) return excluded;
  for (const row of exclusions) {
    if (normaliseLabel(`${row.make_name} ${row.model_name}`) === label) {
      excluded.add(row.node_id);
    }
  }
  return excluded;
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
    if (!normaliseLabel(modelLabel)) return new Set();
    const { data: rows } = await db
      .from("repair_vehicle_exclusions")
      .select("node_id, make_name, model_name");
    return excludedRepairNodeIdsForLabel(modelLabel, rows ?? []);
  } catch (err) {
    console.error("[haynespro] repair exclusion lookup failed:", err);
    return new Set();
  }
}
