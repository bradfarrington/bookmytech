import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogueProductRow } from "./products";

// Reads catalogue_products (0060). Fails open the way the overlay does: before
// the migration exists, or on any read error, there are no products and the
// catalogue is HaynesPro's tree under a lone "Repairs" heading.
//
// 0088 (Task 74) added fuel_types and info_sheet. Until it is applied, asking
// for them fails the whole read — which would take every product off the site
// — so a failed read is retried with the columns that existed before it.
// 0091 (Task 83) added part_genart_ids, with the same fallback a step earlier.

const BASE_COLUMNS =
  "id, category, name, summary, description, price_pence, labour_hours, duration_hours, includes_engine_oil, display_order, is_active";
const TASK_74_COLUMNS = `${BASE_COLUMNS}, fuel_types, info_sheet`;
const TASK_83_COLUMNS = `${TASK_74_COLUMNS}, part_genart_ids`;

export async function loadCatalogueProducts(db: SupabaseClient): Promise<CatalogueProductRow[]> {
  try {
    const full = await db.from("catalogue_products").select(TASK_83_COLUMNS);
    if (!full.error) return (full.data ?? []) as CatalogueProductRow[];
    const task74 = await db.from("catalogue_products").select(TASK_74_COLUMNS);
    if (!task74.error) return (task74.data ?? []) as CatalogueProductRow[];
    const base = await db.from("catalogue_products").select(BASE_COLUMNS);
    if (base.error) return [];
    return (base.data ?? []) as CatalogueProductRow[];
  } catch (err) {
    console.error("[catalogue] products load failed:", err);
    return [];
  }
}
