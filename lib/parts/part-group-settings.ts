// Which part groups customers are charged for (Task 43).
//
// Every TecDoc part group a HaynesPro repair names is charged by default. An
// admin can switch one off on the vehicle page's Parts panel when it's a
// workshop tool rather than a part ("Battery charger"); that is stored in
// `part_group_settings` (migration 0070), and a missing row means charged.
//
// Until 0070 is applied the table is missing, and parts pricing stays off:
// quotes are labour-only, exactly as before. The check is repeated every few
// minutes, so applying the migration switches pricing on without a restart.

import type { SupabaseClient } from "@supabase/supabase-js";

const TABLE = "part_group_settings";
const RECHECK_MISSING_MS = 5 * 60 * 1000;

/** PostgREST / Postgres codes for "that table doesn't exist". */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

let missingUntil = 0;

export type PartGroupSettings =
  | { enabled: false }
  | {
      enabled: true;
      /** Part groups an admin switched off. */
      uncharged: Set<number>;
    };

/** The switched-off groups among these ids, or `enabled: false` while migration 0070 is missing. */
export async function loadPartGroupSettings(db: SupabaseClient, genartIds: readonly number[]): Promise<PartGroupSettings> {
  if (Date.now() < missingUntil) return { enabled: false };
  if (genartIds.length === 0) return { enabled: true, uncharged: new Set() };
  try {
    const { data, error } = await db.from(TABLE).select("genart_id, charged").in("genart_id", [...genartIds]);
    if (error) {
      if (isMissingTable(error)) {
        missingUntil = Date.now() + RECHECK_MISSING_MS;
        return { enabled: false };
      }
      return { enabled: true, uncharged: new Set() };
    }
    const rows = (data ?? []) as Array<{ genart_id: number; charged: boolean }>;
    return { enabled: true, uncharged: new Set(rows.filter((r) => r.charged === false).map((r) => r.genart_id)) };
  } catch {
    return { enabled: true, uncharged: new Set() };
  }
}
