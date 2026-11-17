// Part types NAPA had nothing for, recorded per model as customers price
// repairs (Task 77). The admin Parts gaps screen lists them, so Gareth works
// through the gaps on the cars customers actually look up, not a test car.
//
// A gap is a charged part type with no part from NAPA for this car: NAPA said
// "no parts", or couldn't answer and had no answer from the last 7 days. It is
// recorded whether or not an estimate, a set price or Gareth's model part
// then covered it, so the screen can show what's covered and how.
//
// One upsert per quote that has gaps. Until migration 0090 is applied the
// table is missing and nothing is recorded. Never throws.

import type { SupabaseClient } from "@supabase/supabase-js";

import { aagRegKey } from "@/lib/aag/client";
import type { VehicleModel } from "./model-parts";

export interface GapSighting {
  genartId: number;
  label: string;
  sampleRepair: string | null;
}

/** Rows to upsert, one per part type, first sighting's label and repair. Pure. */
export function partGapRows(model: VehicleModel, reg: string, sightings: readonly GapSighting[], now: string) {
  const byGenart = new Map<number, GapSighting>();
  for (const s of sightings) if (!byGenart.has(s.genartId)) byGenart.set(s.genartId, s);
  return [...byGenart.values()].map((s) => ({
    make_name: model.make,
    model_label: model.modelLabel,
    genart_id: s.genartId,
    label: s.label || null,
    sample_repair: s.sampleRepair,
    last_reg: aagRegKey(reg) || null,
    last_seen_at: now,
  }));
}

export async function recordPartGaps(
  db: SupabaseClient,
  model: VehicleModel,
  reg: string,
  sightings: readonly GapSighting[],
): Promise<void> {
  if (sightings.length === 0) return;
  try {
    await db
      .from("part_gaps")
      .upsert(partGapRows(model, reg, sightings, new Date().toISOString()), { onConflict: "make_name,model_label,genart_id" });
  } catch {
    // A gap not recorded is seen again on the next quote.
  }
}
