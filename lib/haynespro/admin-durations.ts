// Per-type service durations for the admin Vehicles model page (Task 16
// Stage E): "what would each of our services bill on this exact car?"
//
// Reuses the same mapping table + pure combine helpers the pricing engine
// uses (lib/haynespro/durations.ts), but keyed on an admin-chosen carTypeId
// instead of a booking reg — no vehicle cache involved.

import type { SupabaseClient } from "@supabase/supabase-js";
import { billableHours } from "@/lib/pricing/billable";
import { combineNodeTimes, maintenanceHours, type TimeMapping } from "./durations";
import { getGenartNodes, getMaintenanceSystems, getRepairtimeTypeId } from "./tree";

export interface ServiceDurationRow {
  serviceId: string;
  serviceName: string;
  strategy: TimeMapping["strategy"];
  /** Raw HaynesPro hours for this exact type (null = falls back to default). */
  rawHours: number | null;
  /** What the customer would be billed: max(1, ceil(raw)). */
  billedHours: number | null;
  /** The service's admin-entered default duration. */
  defaultHours: number | null;
}

export async function serviceDurationsForType(
  carTypeId: number,
  db: SupabaseClient,
): Promise<ServiceDurationRow[]> {
  const { data: services } = await db
    .from("services")
    .select("id, name, duration_hours, display_order")
    .eq("is_active", true)
    .order("display_order", { ascending: true });
  if (!services || services.length === 0) return [];

  const { data: mappings } = await db
    .from("service_time_mappings")
    .select("service_id, strategy, genart_ids, description_filter, combine");
  const mappingByService = new Map(
    (mappings ?? []).map((m) => [
      m.service_id as string,
      {
        strategy: m.strategy,
        genartIds: (m.genart_ids ?? []) as number[],
        descriptionFilter: m.description_filter ?? null,
        combine: (m.combine ?? "max") as TimeMapping["combine"],
      } satisfies TimeMapping,
    ]),
  );

  const repairtimeTypeId = await getRepairtimeTypeId(carTypeId);

  const rows: ServiceDurationRow[] = [];
  for (const service of services) {
    const mapping = mappingByService.get(service.id);
    const strategy = mapping?.strategy ?? "none";
    let raw: number | null = null;
    try {
      if (mapping && strategy === "genart") {
        if (repairtimeTypeId != null && mapping.genartIds.length > 0) {
          const nodes = await getGenartNodes(repairtimeTypeId, mapping.genartIds);
          raw = combineNodeTimes(nodes, mapping);
        }
      } else if (strategy === "maintenance_max" || strategy === "maintenance_min") {
        const systems = await getMaintenanceSystems(carTypeId);
        raw = maintenanceHours(systems, strategy === "maintenance_min" ? "min" : "max");
      }
    } catch (err) {
      console.error("[haynespro] admin duration lookup failed:", err);
    }
    rows.push({
      serviceId: service.id,
      serviceName: service.name,
      strategy,
      rawHours: raw,
      billedHours: billableHours(raw),
      defaultHours:
        service.duration_hours == null ? null : Number(service.duration_hours),
    });
  }
  return rows;
}
