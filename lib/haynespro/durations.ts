// Vehicle-specific duration lookup (Task 16).
//
// Given a service and a reg, resolve how long the job takes on THAT vehicle
// using the service's admin-configured mapping (service_time_mappings):
//
//   genart           — getRepairtimeNodesByGenartsV4(repairtimeTypeId, ids),
//                      filter leaf descriptions, combine (max/min/sum).
//   maintenance_max  — largest manufacturer-scheduled service time (full service).
//   maintenance_min  — smallest (interim / oil service).
//   none             — no vehicle-specific time; ladder falls through.
//
// Raw (UNROUNDED) hours are returned and cached per (reg, service) on the
// vehicle cache row, so match → slot → create-booking price identically even
// if HaynesPro dips mid-funnel. Rounding to billable whole hours happens in
// the pricing engine (lib/pricing/billable.ts), never here — the raw value is
// also snapshotted onto the booking for transparency.

import type { SupabaseClient } from "@supabase/supabase-js";
import { haynesProCall } from "./client";
import { resolveVehicle, storeCachedDuration } from "./vehicle";
import type { HpMaintenanceSystem, HpRepairtimeNode } from "./types";

export interface TimeMapping {
  strategy: "genart" | "maintenance_max" | "maintenance_min" | "none";
  genartIds: number[];
  descriptionFilter: string | null;
  combine: "max" | "min" | "sum";
}

type DbClient = SupabaseClient;

// ---------------------------------------------------------------------------
// Pure helpers — unit-tested.
// ---------------------------------------------------------------------------

/**
 * Turn repair-time leaf nodes into raw hours per the mapping: keep nodes whose
 * description contains the filter (case-insensitive; no filter = keep all),
 * drop group nodes / zero times, convert ints (hours×100) and combine.
 */
export function combineNodeTimes(
  nodes: Array<Pick<HpRepairtimeNode, "description" | "value">>,
  mapping: Pick<TimeMapping, "descriptionFilter" | "combine">,
): number | null {
  const filter = mapping.descriptionFilter?.trim().toLowerCase() || null;
  const hours: number[] = [];
  for (const node of nodes) {
    const value = node.value;
    if (typeof value !== "number" || value <= 0) continue;
    if (filter && !(node.description ?? "").toLowerCase().includes(filter)) {
      continue;
    }
    hours.push(value / 100);
  }
  if (hours.length === 0) return null;
  if (mapping.combine === "sum") return round2(hours.reduce((a, b) => a + b, 0));
  if (mapping.combine === "min") return round2(Math.min(...hours));
  return round2(Math.max(...hours));
}

/**
 * Collect the SELECTED time of every maintenance period across all systems
 * and take the max (full service) or min (interim). Values are hours×100.
 */
export function maintenanceHours(
  systems: HpMaintenanceSystem[],
  pick: "max" | "min",
): number | null {
  const hours: number[] = [];
  for (const system of systems ?? []) {
    for (const period of system.maintenancePeriods ?? []) {
      for (const time of period.times ?? []) {
        if (!time?.selected) continue;
        if (typeof time.value !== "number" || time.value <= 0) continue;
        hours.push(time.value / 100);
      }
    }
  }
  if (hours.length === 0) return null;
  return round2(pick === "min" ? Math.min(...hours) : Math.max(...hours));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// The lookup.
// ---------------------------------------------------------------------------

/**
 * Raw vehicle-specific duration for (service, reg), or null when unavailable
 * for ANY reason (no mapping, strategy none, unresolvable vehicle, no
 * repair-times coverage, API down). Callers never throw on HaynesPro.
 */
export async function vehicleRawDurationHours(
  serviceId: string,
  reg: string,
  db: DbClient,
): Promise<number | null> {
  try {
    const mapping = await loadMapping(serviceId, db);
    if (!mapping || mapping.strategy === "none") return null;

    const vehicle = await resolveVehicle(reg, db);
    if (!vehicle) return null;

    // Cached from an earlier step of this funnel run (or a previous booking).
    const cached = vehicle.durations[serviceId];
    if (typeof cached === "number" && cached > 0) return cached;

    let raw: number | null = null;

    if (mapping.strategy === "genart") {
      if (vehicle.repairtimeTypeId == null || mapping.genartIds.length === 0) {
        return null;
      }
      const nodes = await haynesProCall<HpRepairtimeNode[]>(
        "getRepairtimeNodesByGenartsV4",
        {
          descriptionLanguage: "en",
          repairtimeTypeId: vehicle.repairtimeTypeId,
          typeCategory: "CAR",
          genArtNumbers: mapping.genartIds,
        },
      );
      raw = combineNodeTimes(nodes ?? [], mapping);
    } else {
      const systems = await haynesProCall<HpMaintenanceSystem[]>(
        "getMaintenanceSystemsV7",
        {
          descriptionLanguage: "en",
          carTypeId: vehicle.carTypeId,
          useImperial: false,
          includeServiceTimes: true,
        },
      );
      raw = maintenanceHours(
        systems ?? [],
        mapping.strategy === "maintenance_min" ? "min" : "max",
      );
    }

    if (raw == null || raw <= 0) return null;

    await storeCachedDuration(reg, serviceId, raw, db);
    return raw;
  } catch (err) {
    console.error("[haynespro] duration lookup failed:", err);
    return null;
  }
}

async function loadMapping(
  serviceId: string,
  db: DbClient,
): Promise<TimeMapping | null> {
  const { data } = await db
    .from("service_time_mappings")
    .select("strategy, genart_ids, description_filter, combine")
    .eq("service_id", serviceId)
    .maybeSingle();
  if (!data) return null;
  return {
    strategy: data.strategy,
    genartIds: (data.genart_ids ?? []) as number[],
    descriptionFilter: data.description_filter ?? null,
    combine: (data.combine ?? "max") as TimeMapping["combine"],
  };
}
