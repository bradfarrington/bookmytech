// One shape for a part offer (Tasks 42 and 45).
//
// Alliance Automotive answers with articles carrying product options. They are
// mapped into SupplierOffer once, here, so the admin vehicle page and the
// customer quote read one normalised shape rather than AAG's raw reply. LKQ was
// removed on 2026-09-15 (Task 43), so AAG is the only supplier; an offer still
// names its supplier because a stored part choice does.
//
// MONEY RULES:
//   - Integer pence everywhere. No floats reach a screen.
//   - costPence is the SUPPLIER COST, passed through. No BMT markup is applied
//     anywhere (owner decision, 2026-09-11).
//   - costPence and surchargePence are NEVER SUMMED. A core charge is shown on
//     its own.
//   - A null quantity means "no figure given", never zero.

import type { AagQuoteLine } from "@/lib/aag/quote";

export type SupplierId = "aag";

export const SUPPLIER_LABEL: Record<SupplierId, string> = {
  aag: "Alliance Automotive",
};

export interface SupplierStockLine {
  label: string;
  qty: number | null;
  eta: string | null;
  /** The location the supplier would actually pick from. */
  emphasis?: boolean;
}

export interface SupplierOffer {
  supplier: SupplierId;
  partNumber: string;
  description: string | null;
  brand: string | null;
  /** The supplier's own quality wording: "Good", "Better", "Best". */
  tier: string | null;
  /** What we pay. Supplier cost, pass-through. Null = not sellable to us. */
  costPence: number | null;
  /** Separate from cost, never added to it. */
  surchargePence: number | null;
  availability: SupplierStockLine[];
  /** Null when the supplier gave no stock figures at all. */
  totalQty: number | null;
  fitment: Array<{ label: string; value: string }>;
  /** How many the vehicle takes — 2 for brake discs. */
  quantityOfFit: number | null;
  imageUrl: string | null;
  /** Lockout, minimum order, core charge and similar. */
  notes: string[];
  buyable: boolean;
}

export type SupplierPanel =
  | { state: "ok"; offers: SupplierOffer[] }
  | { state: "empty"; message: string }
  | { state: "not_connected"; message: string; hint: string | null; href: string | null };

/**
 * The dearest offer we could actually buy — the default part for a repair
 * (Task 45, owner: "the best and highest cost one"). Null when nothing is priced.
 */
export function dearestOffer(offers: readonly SupplierOffer[]): SupplierOffer | null {
  let best: SupplierOffer | null = null;
  for (const offer of offers) {
    if (!offer.buyable || offer.costPence == null) continue;
    if (!best || offer.costPence > (best.costPence as number)) best = offer;
  }
  return best;
}

/** Map AAG's already-flattened quote lines into the offer shape. */
export function aagOffers(lines: readonly AagQuoteLine[]): SupplierOffer[] {
  return lines.map((line) => {
    const notes: string[] = [];
    if (line.lockout && !line.sellable) notes.push(`Locked out: ${line.lockout}`);
    if (line.surchargePence != null) {
      notes.push("Carries a core charge (shown separately, not added to the cost)");
    }
    if (line.minOrderQty > 1) notes.push(`Minimum order ${line.minOrderQty}`);

    return {
      supplier: "aag" as const,
      partNumber: line.productId,
      description: line.article || null,
      brand: line.brand,
      tier: line.rating,
      costPence: line.costPence,
      surchargePence: line.surchargePence,
      availability: line.stock.map<SupplierStockLine>((s) => ({
        label: s.locationName,
        qty: s.qty,
        eta: s.eta,
        emphasis: s.locationId === line.quickest?.locationId,
      })),
      totalQty: line.stock.length > 0 ? line.totalQty : null,
      fitment: line.fittingPosition
        ? [{ label: "Fitting position", value: line.fittingPosition }]
        : [],
      quantityOfFit: null,
      imageUrl: line.imageUrl,
      notes,
      buyable: line.sellable && line.costPence != null,
    };
  });
}
