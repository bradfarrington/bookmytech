// Which part groups customers are charged for, and at what set price when
// Alliance Automotive can't price them (Task 43).
//
// Every TecDoc part group a HaynesPro repair names is charged by default. An
// admin can switch one off on the vehicle page's Parts panel when it's a
// workshop tool rather than a part ("Battery charger"), and can give one a set
// price for when AAG has none (antifreeze, screenwash). Both live in
// `part_group_settings` (migrations 0070, 0071); a missing row means charged,
// with no set price.
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

/** PostgREST / Postgres codes for "that column doesn't exist" (a migration not yet applied). */
export function isMissingColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === "PGRST204" || error?.code === "42703";
}

let missingUntil = 0;

export interface PartGroupSetPrice {
  pence: number;
  /** When the admin set it, ISO. */
  setAt: string;
}

export type PartGroupSettings =
  | { enabled: false }
  | {
      enabled: true;
      /** Part groups an admin switched off. */
      uncharged: Set<number>;
      /** Set prices for when AAG can't price a group (migration 0071). */
      setPrices: Map<number, PartGroupSetPrice>;
    };

interface SettingsRow {
  genart_id: number;
  charged?: boolean | null;
  set_price_pence?: number | null;
  changed_at?: string | null;
}

/** The settings among these ids, or `enabled: false` while migration 0070 is missing. */
export async function loadPartGroupSettings(db: SupabaseClient, genartIds: readonly number[]): Promise<PartGroupSettings> {
  if (Date.now() < missingUntil) return { enabled: false };
  const empty = { enabled: true as const, uncharged: new Set<number>(), setPrices: new Map<number, PartGroupSetPrice>() };
  if (genartIds.length === 0) return empty;
  try {
    // "*": set_price_pence arrives with 0071, and naming it before then would
    // fail the read and lose the switched-off groups with it.
    const { data, error } = await db.from(TABLE).select("*").in("genart_id", [...genartIds]);
    if (error) {
      if (isMissingTable(error)) {
        missingUntil = Date.now() + RECHECK_MISSING_MS;
        return { enabled: false };
      }
      return empty;
    }
    const rows = (data ?? []) as SettingsRow[];
    const setPrices = new Map<number, PartGroupSetPrice>();
    for (const row of rows) {
      const pence = row.set_price_pence;
      if (typeof pence === "number" && Number.isInteger(pence) && pence >= 0) {
        setPrices.set(row.genart_id, { pence, setAt: row.changed_at ?? new Date(0).toISOString() });
      }
    }
    return {
      enabled: true,
      uncharged: new Set(rows.filter((r) => r.charged === false).map((r) => r.genart_id)),
      setPrices,
    };
  } catch {
    return empty;
  }
}
