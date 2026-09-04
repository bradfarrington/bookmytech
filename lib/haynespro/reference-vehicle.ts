import type { SupabaseClient } from "@supabase/supabase-js";

// The car type /admin/repairs browses when switching repairs off for every
// vehicle (Task 23). The HaynesPro tree is per vehicle, but a node id means
// the same job on every make (verified live, see docs/tasks/23), so any
// well-covered car will do as the "reference". The admin can change it; the
// choice is remembered in platform_settings.

export const REFERENCE_VEHICLE_KEY = "repair_reference_vehicle";

export interface ReferenceVehicle {
  carTypeId: number;
  label: string;
}

/** VW Golf VII 1.0 TSI — the type both verification scripts used. */
export const DEFAULT_REFERENCE_VEHICLE: ReferenceVehicle = {
  carTypeId: 317000222,
  label: "VOLKSWAGEN Golf VII (5G, BE, BA, BV, BQ) 1.0 TSI",
};

/** Pure — anything malformed is the default. */
export function parseReferenceVehicle(raw: unknown): ReferenceVehicle {
  if (raw && typeof raw === "object") {
    const rec = raw as Record<string, unknown>;
    const carTypeId = typeof rec.carTypeId === "number" ? rec.carTypeId : Number(rec.carTypeId);
    if (Number.isInteger(carTypeId) && carTypeId > 0) {
      return {
        carTypeId,
        label:
          typeof rec.label === "string" && rec.label.trim() ? rec.label.trim() : `Car type ${carTypeId}`,
      };
    }
  }
  return DEFAULT_REFERENCE_VEHICLE;
}

export async function getReferenceVehicle(db: SupabaseClient): Promise<ReferenceVehicle> {
  try {
    const { data } = await db
      .from("platform_settings")
      .select("value")
      .eq("key", REFERENCE_VEHICLE_KEY)
      .maybeSingle();
    return parseReferenceVehicle(data?.value);
  } catch {
    return DEFAULT_REFERENCE_VEHICLE;
  }
}
