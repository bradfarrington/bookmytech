import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildOverlay,
  EMPTY_OVERLAY,
  type BundleOptionRow,
  type BundleRow,
  type CatalogueGroupRow,
  type CatalogueOverlay,
  type CatalogueOverrideRow,
} from "./overlay";

// Reads the four overlay tables (0056) into one object. Fails open: before the
// migration exists, or on any read error, the overlay is empty and the
// catalogue is exactly HaynesPro's — the same fail-open the hides have.

export async function loadCatalogueOverlay(db: SupabaseClient): Promise<CatalogueOverlay> {
  try {
    const [groups, overrides, bundles, options] = await Promise.all([
      db.from("repair_catalogue_groups").select("id, name, parent_id, display_order"),
      db
        .from("repair_catalogue_overrides")
        .select("node_id, kind, description, custom_name, parent_id, display_order"),
      db.from("repair_bundles").select("id, name, description, parent_id, node_ids, display_order, is_active"),
      db.from("repair_bundle_options").select("id, bundle_id, label, node_ids, position"),
    ]);
    if (groups.error || overrides.error || bundles.error || options.error) return EMPTY_OVERLAY;
    return buildOverlay({
      groups: (groups.data ?? []) as CatalogueGroupRow[],
      overrides: (overrides.data ?? []) as CatalogueOverrideRow[],
      bundles: (bundles.data ?? []) as BundleRow[],
      options: (options.data ?? []) as BundleOptionRow[],
    });
  } catch (err) {
    console.error("[catalogue] overlay load failed:", err);
    return EMPTY_OVERLAY;
  }
}
