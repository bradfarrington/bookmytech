import type { SupabaseClient } from "@supabase/supabase-js";
import type { RepairLineView } from "@/lib/bookings/repair-lines";
import { productUuid } from "@/lib/catalogue/products";
import {
  checklistProgress,
  checklistsForBooking,
  groupBySection,
  itemsForTier,
  type ChecklistItemRow,
  type ChecklistProgress,
  type ChecklistResultRow,
  type ChecklistRow,
  type ChecklistSection,
  type ChecklistTier,
} from "./checklists";

// Loads everything a booking's checklists need in three reads (Task 32):
// the products' links, the checklists + items, and this booking's results.
// Used by the mechanic's panel, the completion gate, the customer's report and
// the admin's card, so the four can't disagree about what a booking has to
// answer. Fails open to "no checklists" before 0061 exists or on any error.

export interface LoadedChecklist {
  checklist: ChecklistRow;
  tier: ChecklistTier | null;
  /** "Full service checklist" / "Pre-purchase inspection · Gold". */
  name: string;
  items: ChecklistItemRow[];
  sections: ChecklistSection[];
  results: ChecklistResultRow[];
  progress: ChecklistProgress;
}

/** The "p:" ids in a booking's lines. */
export function productIdsInLines(lines: readonly RepairLineView[]): string[] {
  return lines.filter((l) => l.product && l.nodeId).map((l) => l.nodeId as string);
}

const TIER_LABEL: Record<ChecklistTier, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold" };

export async function loadBookingChecklists(
  db: SupabaseClient,
  bookingId: string,
  productIds: readonly string[],
): Promise<LoadedChecklist[]> {
  if (productIds.length === 0) return [];
  try {
    const uuids = productIds.map(productUuid);
    const { data: products, error: productsError } = await db
      .from("catalogue_products")
      .select("id, checklist_id, checklist_tier")
      .in("id", uuids);
    if (productsError || !products) return [];
    const wanted = checklistsForBooking(
      productIds,
      products.map((p) => ({ productId: `p:${p.id}`, checklist_id: p.checklist_id, checklist_tier: p.checklist_tier })),
    );
    if (wanted.length === 0) return [];

    const checklistIds = wanted.map((w) => w.checklistId);
    const [{ data: checklists }, { data: items }, { data: results }] = await Promise.all([
      db.from("checklists").select("id, key, name, kind").in("id", checklistIds),
      db
        .from("checklist_items")
        .select("id, checklist_id, section, label, position, tiers, is_active")
        .in("checklist_id", checklistIds),
      db.from("booking_checklist_results").select("item_id, result, comment, updated_at").eq("booking_id", bookingId),
    ]);

    const out: LoadedChecklist[] = [];
    for (const w of wanted) {
      const checklist = (checklists ?? []).find((c) => c.id === w.checklistId) as ChecklistRow | undefined;
      if (!checklist) continue;
      const tierItems = itemsForTier((items ?? []) as ChecklistItemRow[], w.checklistId, w.tier);
      const own = ((results ?? []) as ChecklistResultRow[]).filter((r) => tierItems.some((i) => i.id === r.item_id));
      out.push({
        checklist,
        tier: w.tier,
        name: w.tier ? `${checklist.name} · ${TIER_LABEL[w.tier]}` : checklist.name,
        items: tierItems,
        sections: groupBySection(tierItems),
        results: own,
        progress: checklistProgress(tierItems, own),
      });
    }
    return out;
  } catch (err) {
    console.error("[checklists] load failed:", err);
    return [];
  }
}
