// One shape for a part offer (Tasks 42, 45 and 43).
//
// Alliance Automotive answers with articles carrying product options. They are
// mapped into SupplierOffer once, here, so the admin vehicle page and the
// customer quote read one normalised shape rather than AAG's raw reply. LKQ was
// removed on 2026-09-15 (Task 43), so AAG is the only supplier; an offer still
// names its supplier because a stored part choice does.
//
// MONEY RULES:
//   - Integer pence everywhere. No floats reach a screen.
//   - costPence is the SUPPLIER COST per unit, passed through. No BMT markup is
//     applied anywhere (owner decision, 2026-09-11).
//   - A part is bought in the supplier's unit of issue: AAG prices brake discs
//     PER DISC and sells them in twos ("BRAKE DISC PAIR (PRICE PER DISC)",
//     RecMinOrdQty 2). quantityOfFit carries that, so a pair costs 2 × cost.
//   - costPence and surchargePence are NEVER SUMMED. A core charge is shown on
//     its own, and a £0.00 one is no core charge at all.

import type { AagQuoteLine } from "@/lib/aag/quote";

export type SupplierId = "aag";

export const SUPPLIER_LABEL: Record<SupplierId, string> = {
  aag: "Alliance Automotive",
};

/** Which axle a part fits. */
export type PartPosition = "front" | "rear";

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
  /** What we pay per unit. Supplier cost, pass-through. Null = not sellable to us. */
  costPence: number | null;
  /** A core charge, separate from cost and never added to it. Null when there is none. */
  surchargePence: number | null;
  availability: SupplierStockLine[];
  /** Null when the supplier gave no stock figures at all. */
  totalQty: number | null;
  fitment: Array<{ label: string; value: string }>;
  /** How many units the vehicle takes, in the supplier's unit of issue: 2 for brake discs. */
  quantityOfFit: number | null;
  /** Which axle the part fits, when the supplier says. */
  position: PartPosition | null;
  imageUrl: string | null;
  /** Lockout and similar. */
  notes: string[];
  buyable: boolean;
}

export type SupplierPanel =
  | { state: "ok"; offers: SupplierOffer[] }
  | { state: "empty"; message: string }
  | { state: "not_connected"; message: string; hint: string | null; href: string | null };

/** AAG's rating as a rank: Best 3, Better 2, Good 1, anything else 0. The classic quote lower-cases it. */
export function ratingRank(tier: string | null | undefined): number {
  switch (String(tier ?? "").trim().toLowerCase()) {
    case "best":
      return 3;
    case "better":
      return 2;
    case "good":
      return 1;
    default:
      return 0;
  }
}

/** What an offer costs for the quantity the vehicle takes. Null when it isn't priced. */
export function offerLinePence(offer: SupplierOffer): number | null {
  if (offer.costPence == null) return null;
  const quantity = offer.quantityOfFit && offer.quantityOfFit > 0 ? offer.quantityOfFit : 1;
  return offer.costPence * quantity;
}

/**
 * The default part for a repair: the best-rated part we could actually buy,
 * the dearest within that rating (owner decision, 2026-09-15: "Best-rated,
 * dearest within"). Null when nothing is buyable.
 */
export function defaultOffer(offers: readonly SupplierOffer[]): SupplierOffer | null {
  let best: SupplierOffer | null = null;
  for (const offer of offers) {
    const line = offerLinePence(offer);
    if (!offer.buyable || line == null) continue;
    if (!best) {
      best = offer;
      continue;
    }
    const byRating = ratingRank(offer.tier) - ratingRank(best.tier);
    if (byRating > 0 || (byRating === 0 && line > (offerLinePence(best) as number))) best = offer;
  }
  return best;
}

/** The axle a fitting-position code ("FR", "RR") or a description ("… - FRONT") names. */
export function positionOf(fittingPosition: string | null | undefined, description: string | null | undefined): PartPosition | null {
  const code = String(fittingPosition ?? "").trim().toUpperCase();
  if (code === "FR" || code === "F" || code === "FRONT") return "front";
  if (code === "RR" || code === "R" || code === "REAR") return "rear";
  const text = String(description ?? "");
  const front = /\bfront\b/i.test(text);
  const rear = /\brear\b/i.test(text);
  return front === rear ? null : front ? "front" : "rear";
}

/** Map AAG's already-flattened quote lines into the offer shape. */
export function aagOffers(lines: readonly AagQuoteLine[]): SupplierOffer[] {
  return lines.map((line) => {
    const surchargePence = line.surchargePence != null && line.surchargePence > 0 ? line.surchargePence : null;
    const notes: string[] = [];
    if (line.lockout && !line.sellable) notes.push(`Locked out: ${line.lockout}`);
    if (surchargePence != null) {
      notes.push("Carries a core charge (shown separately, not added to the cost)");
    }

    return {
      supplier: "aag" as const,
      partNumber: line.productId,
      description: line.article || null,
      brand: line.brand,
      tier: line.rating,
      costPence: line.costPence,
      surchargePence,
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
      quantityOfFit: line.minOrderQty,
      position: positionOf(line.fittingPosition, line.article),
      imageUrl: line.imageUrl,
      notes,
      buyable: line.sellable && line.costPence != null,
    };
  });
}
