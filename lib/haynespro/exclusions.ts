// Per-vehicle service availability (Task 16 Stage D).
//
// Every service is available on every vehicle by default. The admin can switch
// a service OFF for a specific model (service_vehicle_exclusions, keyed on
// HaynesPro make/model NAMES — stable across their quarterly DB updates,
// unlike the numeric ids). The booking service grid hides excluded services
// once the reg resolves; any failure to resolve matches nothing, so unknown
// vehicles always see the full list.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ExclusionRow {
  service_id: string;
  make_name: string;
  model_name: string;
}

/** Uppercase + collapse whitespace so label comparison survives spacing/case drift. */
export function normaliseLabel(raw: string | null | undefined): string {
  return (raw ?? "").toUpperCase().replace(/\s+/g, " ").trim();
}

/**
 * Service ids excluded for a vehicle whose cache row carries `modelLabel`
 * (e.g. "VOLKSWAGEN Golf IV (1J)"). Pure — unit-tested.
 */
export function excludedServiceIdsForLabel(
  modelLabel: string | null | undefined,
  exclusions: ExclusionRow[],
): Set<string> {
  const excluded = new Set<string>();
  const label = normaliseLabel(modelLabel);
  if (!label) return excluded;
  for (const row of exclusions) {
    if (normaliseLabel(`${row.make_name} ${row.model_name}`) === label) {
      excluded.add(row.service_id);
    }
  }
  return excluded;
}

export interface RepairExclusionRow {
  node_id: string;
  make_name: string;
  model_name: string;
}

/**
 * Repair-tree node ids excluded for a vehicle whose cache row carries
 * `modelLabel` (Task 16 Stage G follow-up). Pure — unit-tested.
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

/**
 * Resolve the reg and return the service ids to hide from its service grid.
 * Cheap when no exclusions exist (one indexed read, no HaynesPro traffic —
 * the common case); never throws — errors mean "hide nothing".
 */
export async function excludedServiceIdsForReg(
  reg: string,
  db: SupabaseClient,
): Promise<Set<string>> {
  try {
    // The exclusions table is tiny (admin-curated exceptions). Read it first:
    // when it's empty there is nothing to hide and no reason to resolve the
    // vehicle at all.
    const { data: rows } = await db
      .from("service_vehicle_exclusions")
      .select("service_id, make_name, model_name");
    if (!rows || rows.length === 0) return new Set();

    const { resolveVehicle } = await import("./vehicle");
    const vehicle = await resolveVehicle(reg, db);
    return excludedServiceIdsForLabel(vehicle?.hpModelLabel, rows);
  } catch (err) {
    console.error("[haynespro] exclusion lookup failed:", err);
    return new Set();
  }
}
