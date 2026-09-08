import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogueProductRow } from "./products";

// Reads catalogue_products (0060). Fails open the way the overlay does: before
// the migration exists, or on any read error, there are no products and the
// catalogue is HaynesPro's tree under a lone "Repairs" heading.

export async function loadCatalogueProducts(db: SupabaseClient): Promise<CatalogueProductRow[]> {
  try {
    const { data, error } = await db
      .from("catalogue_products")
      .select(
        "id, category, name, summary, description, price_pence, labour_hours, duration_hours, includes_engine_oil, display_order, is_active",
      );
    if (error) return [];
    return (data ?? []) as CatalogueProductRow[];
  } catch (err) {
    console.error("[catalogue] products load failed:", err);
    return [];
  }
}
