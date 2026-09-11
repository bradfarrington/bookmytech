// One shape for a part offer, whatever supplier it came from (Task 42).
//
// WHY THIS EXISTS. LKQ answers with ADS catalogue rows joined to ECP price
// ladders; AAG answers with articles carrying product options. If each column
// rendered its own supplier's shape, the two would be ADJACENT but not
// COMPARABLE — the reader would be doing the normalisation in their head, which
// is exactly where a costing mistake comes from. Both are mapped into
// SupplierOffer first, and one component renders both.
//
// MONEY RULES, inherited from docs/06-lkq-parts-api.md:
//   - Integer pence everywhere. No floats reach a screen.
//   - costPence is the SUPPLIER COST, passed through. No BMT markup is applied
//     anywhere in this task (owner decision, 2026-09-11).
//   - costPence and surchargePence are NEVER SUMMED. Whether LKQ's ShowPrice
//     already includes the surcharge is unverified and worth up to £59.95 on a
//     starter motor (§8 Q1). Two figures, shown separately, until someone knows.
//   - A null quantity means "no figure given", never zero.

import type { AagQuoteLine } from "@/lib/aag/quote";
import { fitmentOf } from "@/lib/lkq/fitment";
import type { PartGroupMapping } from "@/lib/lkq/mapping";
import { isBuyable, priceLadder, stockLevels } from "@/lib/lkq/price";
import type { AdsPart, LkqPriceRow } from "@/lib/lkq/types";

export type SupplierId = "lkq" | "aag";

export const SUPPLIER_LABEL: Record<SupplierId, string> = {
  lkq: "LKQ Euro Car Parts",
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
  /** The catalogue part these variants ladder from — groups rows in the UI. */
  groupKey: string;
  partNumber: string;
  description: string | null;
  brand: string | null;
  /** The supplier's own quality wording: "OES", "Premium", a rating. */
  tier: string | null;
  /** What we pay. Supplier cost, pass-through. Null = not sellable to us. */
  costPence: number | null;
  /** Separate from cost, never added to it. */
  surchargePence: number | null;
  rrpPence: number | null;
  availability: SupplierStockLine[];
  /** Null when the supplier gave no stock figures at all. */
  totalQty: number | null;
  fitment: Array<{ label: string; value: string }>;
  /** How many the vehicle takes — 2 for brake discs. */
  quantityOfFit: number | null;
  imageUrl: string | null;
  /** Supersession, lockout, "surcharge unconfirmed" and similar. */
  notes: string[];
  buyable: boolean;
}

export type SupplierPanel =
  | {
      state: "ok";
      offers: SupplierOffer[];
      cheapestPartNumber: string | null;
      /** Catalogue numbers the supplier priced at £0.00 — shown, never silently dropped. */
      notFound: string[];
      cached: boolean;
    }
  | { state: "empty"; message: string }
  | { state: "not_mapped"; message: string }
  | { state: "not_connected"; message: string; hint: string | null; href: string | null }
  | { state: "error"; message: string };

/** Cheapest offer we could actually buy. Null when nothing is priced. */
export function cheapestOffer(offers: readonly SupplierOffer[]): SupplierOffer | null {
  let best: SupplierOffer | null = null;
  for (const offer of offers) {
    if (!offer.buyable || offer.costPence == null) continue;
    if (!best || offer.costPence < (best.costPence as number)) best = offer;
  }
  return best;
}

/**
 * The cheapest across every supplier that answered. Panels in any other state
 * are ignored rather than treated as zero.
 */
export function bestPriceAcross(
  panels: Partial<Record<SupplierId, SupplierPanel>>,
): { supplier: SupplierId; offer: SupplierOffer } | null {
  let best: { supplier: SupplierId; offer: SupplierOffer } | null = null;
  for (const [supplier, panel] of Object.entries(panels) as Array<[SupplierId, SupplierPanel]>) {
    if (!panel || panel.state !== "ok") continue;
    const cheapest = cheapestOffer(panel.offers);
    if (!cheapest || cheapest.costPence == null) continue;
    if (!best || cheapest.costPence < (best.offer.costPence as number)) {
      best = { supplier, offer: cheapest };
    }
  }
  return best;
}

/**
 * Join the ADS catalogue rows to the ECP price ladder.
 *
 * ADS knows what fits (fitment, quantity of fit, image) but carries NO
 * description and NO brand. ECP knows the money and the words. They join on the
 * 8-digit catalogue number: one ADS part becomes ~8 offers, one per branded
 * variant, each inheriting its parent's fitment.
 */
export function lkqOffers(
  group: PartGroupMapping,
  parts: readonly AdsPart[],
  labels: Map<string, string>,
  priceRows: readonly LkqPriceRow[],
): SupplierOffer[] {
  const ladder = priceLadder(priceRows);
  const offers: SupplierOffer[] = [];

  for (const part of parts) {
    const catalogueNo = String(part?.PartNumber ?? "").trim();
    if (!catalogueNo) continue;

    const variants = ladder.get(catalogueNo) ?? [];
    const fitment = fitmentOf(part, labels);
    const quantityOfFit =
      typeof part?.QuantityOfFit === "number" && part.QuantityOfFit > 0
        ? part.QuantityOfFit
        : null;
    const imageUrl =
      typeof part?.ImagePath === "string" && /^https?:\/\//i.test(part.ImagePath)
        ? part.ImagePath
        : null;

    if (variants.length === 0) {
      // ADS lists it, ECP has no price for it. Show it as a real part with no
      // price rather than dropping it — a gap the buyer should see.
      offers.push({
        supplier: "lkq",
        groupKey: catalogueNo,
        partNumber: catalogueNo,
        description: null,
        brand: null,
        tier: null,
        costPence: null,
        surchargePence: null,
        rrpPence: null,
        availability: [],
        totalQty: null,
        fitment,
        quantityOfFit,
        imageUrl,
        notes: ["LKQ's catalogue lists this part but returned no price for this account."],
        buyable: false,
      });
      continue;
    }

    for (const row of variants) {
      const notes: string[] = [];
      if (row.supersededTo) notes.push(`Superseded to ${row.supersededTo}`);
      if (row.surchargePence != null) {
        notes.push("Carries a surcharge — shown separately, not added to the cost");
      }
      if (!isBuyable(row)) notes.push("Not priced on this account");

      const levels = stockLevels(row)
        .filter((l) => l.qty != null)
        .map<SupplierStockLine>((l) => ({
          label: l.label,
          qty: l.qty,
          eta: null,
          emphasis: l.label === "Branch",
        }));

      const anyStock = stockLevels(row).some((l) => l.qty != null);

      offers.push({
        supplier: "lkq",
        groupKey: catalogueNo,
        partNumber: row.supplierPartNo,
        description: row.description || null,
        brand: row.brand,
        tier: row.qualityDesc || row.quality,
        costPence: row.showPricePence,
        surchargePence: row.surchargePence,
        // 0 here means "no published RRP", which is not the same as "free".
        rrpPence: row.retailPricePence === 0 ? null : row.retailPricePence,
        availability: levels,
        totalQty: anyStock ? levels.reduce((s, l) => s + (l.qty ?? 0), 0) : null,
        fitment,
        quantityOfFit,
        imageUrl,
        notes,
        buyable: isBuyable(row),
      });
    }
  }

  // Cheapest first within each catalogue part, catalogue parts in ADS order.
  return offers.sort((a, b) => {
    if (a.groupKey !== b.groupKey) return 0;
    const ap = a.buyable ? (a.costPence as number) : Number.POSITIVE_INFINITY;
    const bp = b.buyable ? (b.costPence as number) : Number.POSITIVE_INFINITY;
    return ap - bp;
  });
}

/** Map AAG's already-flattened quote lines into the same shape. */
export function aagOffers(
  group: PartGroupMapping,
  lines: readonly AagQuoteLine[],
): SupplierOffer[] {
  return lines.map((line) => {
    const notes: string[] = [];
    if (line.lockout && !line.sellable) notes.push(`Locked out: ${line.lockout}`);
    if (line.surchargePence != null) {
      notes.push("Carries a core charge — shown separately, not added to the cost");
    }
    if (line.minOrderQty > 1) notes.push(`Minimum order ${line.minOrderQty}`);

    return {
      supplier: "aag" as const,
      groupKey: line.article || group.label,
      partNumber: line.productId,
      description: line.article || null,
      brand: line.brand,
      tier: line.rating,
      costPence: line.costPence,
      surchargePence: line.surchargePence,
      rrpPence: null,
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
      imageUrl: null,
      notes,
      buyable: line.sellable && line.costPence != null,
    };
  });
}

/** Group offers by their catalogue part, preserving order. */
export function groupOffers(
  offers: readonly SupplierOffer[],
): Array<{ groupKey: string; offers: SupplierOffer[] }> {
  const groups: Array<{ groupKey: string; offers: SupplierOffer[] }> = [];
  const index = new Map<string, number>();
  for (const offer of offers) {
    const at = index.get(offer.groupKey);
    if (at === undefined) {
      index.set(offer.groupKey, groups.length);
      groups.push({ groupKey: offer.groupKey, offers: [offer] });
    } else {
      groups[at].offers.push(offer);
    }
  }
  return groups;
}
