// HaynesPro part-type codes mapped to the code NAPA stocks the same part
// under (Task 77).
//
// HaynesPro and NAPA both use TecDoc's part-type ("GenArt") codes, but TecDoc
// has more than one code for some parts, and NAPA only answers to one: brake
// fluid is 71 on a HaynesPro repair and 3357 at NAPA. A mapping is between
// codes for the SAME named part only, never similar wording (Brad,
// 2026-11-17: matching by wording offered brake pads for "Brake pedal").
//
// We propose mappings (scripts/probe-part-code-maps.mjs); Gareth approves each
// one on the Parts gaps screen, and only approved ones are used, for every
// car. The HaynesPro code is still asked first: NAPA's answer under the mapped
// code is used only when the original has no parts (aag-live-offers.ts).
//
// Until migration 0090 is applied the table is missing, and nothing is mapped.

import type { SupabaseClient } from "@supabase/supabase-js";

import { isMissingTable } from "./part-group-settings";

const TABLE = "part_code_maps";

export type CodeMapStatus = "proposed" | "approved" | "rejected";

/** A row of `part_code_maps` (migration 0090). */
export interface PartCodeMapRow {
  genart_id: number;
  napa_genart_id: number;
  label: string | null;
  napa_label: string | null;
  status: CodeMapStatus;
  evidence: Record<string, unknown>;
  proposed_at: string;
  decided_by: string | null;
  decided_at: string | null;
}

/** Approved mappings among these HaynesPro codes: HaynesPro code -> NAPA's. Never throws. */
export async function loadApprovedCodeMaps(db: SupabaseClient, genartIds: readonly number[]): Promise<Map<number, number>> {
  const maps = new Map<number, number>();
  if (genartIds.length === 0) return maps;
  try {
    const { data, error } = await db
      .from(TABLE)
      .select("genart_id, napa_genart_id")
      .eq("status", "approved")
      .in("genart_id", [...new Set(genartIds)]);
    if (error) {
      if (!isMissingTable(error)) console.error("[parts] couldn't read part code maps:", error.message);
      return maps;
    }
    for (const row of (data ?? []) as Array<Pick<PartCodeMapRow, "genart_id" | "napa_genart_id">>) {
      maps.set(row.genart_id, row.napa_genart_id);
    }
  } catch {
    // Nothing mapped: the HaynesPro code is asked alone, as before.
  }
  return maps;
}
