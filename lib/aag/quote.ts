// Pure helpers over an AAG quote reply (Task 40): flatten the nested
// articles → product options → availability into rows the admin check page
// can render, and turn AAG's decimal pounds into the integer pence the rest
// of the codebase uses. No I/O; unit-tested against the manual's example and
// against captured sandbox replies once those exist.

import type { AagArticle, AagAvailability, AagProductOption, AagQuoteBody } from "./types";

/** "11.21" pounds → 1121 pence. Null for anything that isn't a finite number. */
export function poundsToPence(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

export interface AagStockLine {
  locationId: number | null;
  locationName: string;
  locationType: string | null;
  businessUnit: string | null;
  qty: number;
  eta: string | null;
  priority: number | null;
}

export interface AagQuoteLine {
  /** The article this product satisfies ("B/DISC 258 * 4 (VENTED) - FRONT"). */
  article: string;
  articleProvider: string | null;
  fittingPosition: string | null;
  /** AAG's own line ref — what an enquiry/order would echo back. */
  requestLineId: string | null;
  productId: string;
  brand: string | null;
  /** "Premium" | "Standard" | "Budget" (as AAG spells it). */
  rating: string | null;
  /** Integer pence; null when AAG sent no usable price. */
  costPence: number | null;
  surchargePence: number | null;
  minOrderQty: number;
  /** True unless AAG flagged the product as not sellable to us. */
  sellable: boolean;
  lockout: string | null;
  displayOrder: number | null;
  stock: AagStockLine[];
  /** Total units across every location listed. */
  totalQty: number;
  /** The location AAG ranks quickest (lowest Priority), if any. */
  quickest: AagStockLine | null;
}

function toStock(a: AagAvailability): AagStockLine {
  return {
    locationId: typeof a.AagLocationId === "number" ? a.AagLocationId : null,
    locationName: a.LocationName?.trim() || a.BranchCode?.trim() || "Unknown location",
    locationType: a.LocationType?.trim() || null,
    businessUnit: a.AagBusinessUnit?.trim() || null,
    qty: typeof a.QtyInStock === "number" && a.QtyInStock > 0 ? a.QtyInStock : 0,
    eta: a.EstDeliveryTime?.trim() || null,
    priority: typeof a.Priority === "number" ? a.Priority : null,
  };
}

/**
 * Is the product sellable to us? AAG's flag is free text — "OK FOR SUPPLY",
 * "Unknown", "UNKNOWN" have all appeared in the manual. Only an explicit
 * lock-out is treated as unsellable; unknown is allowed through and shown.
 */
export function isSellable(lockout: string | null | undefined): boolean {
  const v = (lockout ?? "").trim().toUpperCase();
  return !(v.includes("LOCK") || v.includes("NOT FOR SUPPLY") || v.includes("NO SUPPLY"));
}

function toLine(article: AagArticle, option: AagProductOption): AagQuoteLine | null {
  const productId = option.ProductId?.trim();
  if (!productId) return null;
  const stock = (option.Availability ?? []).map(toStock);
  const quickest = stock.reduce<AagStockLine | null>((best, s) => {
    if (s.priority == null) return best;
    return best == null || (best.priority ?? Infinity) > s.priority ? s : best;
  }, null);
  return {
    article: article.ArticleDescription?.trim() || "Part",
    articleProvider: article.ArticleProvider?.trim() || null,
    fittingPosition: article.FittingPosition?.trim() || null,
    requestLineId: option.RequestLineId?.trim() || null,
    productId,
    brand: option.Brand?.trim() || null,
    rating: option.BrandRating?.trim() || null,
    costPence: poundsToPence(option.CostPrice),
    surchargePence: poundsToPence(option.Surcharge),
    minOrderQty: typeof option.RecMinOrdQty === "number" && option.RecMinOrdQty > 0 ? option.RecMinOrdQty : 1,
    sellable: isSellable(option.CustomerLockoutRating),
    lockout: option.CustomerLockoutRating?.trim() || null,
    displayOrder: typeof option.DisplayOrder === "number" ? option.DisplayOrder : null,
    stock,
    totalQty: stock.reduce((n, s) => n + s.qty, 0),
    quickest,
  };
}

/**
 * Every buyable product in a quote as one flat row, in AAG's display order
 * within each article. Products without an id are dropped.
 */
export function flattenQuote(body: AagQuoteBody | null | undefined): AagQuoteLine[] {
  const lines: AagQuoteLine[] = [];
  for (const article of body?.Articles ?? []) {
    const options = [...(article.ProductOptions ?? [])].sort(
      (a, b) => (a.DisplayOrder ?? Infinity) - (b.DisplayOrder ?? Infinity),
    );
    for (const option of options) {
      const line = toLine(article, option);
      if (line) lines.push(line);
    }
  }
  return lines;
}

/** The cheapest sellable, priced line — what a "from £X" would be built on. */
export function cheapestLine(lines: readonly AagQuoteLine[]): AagQuoteLine | null {
  let best: AagQuoteLine | null = null;
  for (const line of lines) {
    if (!line.sellable || line.costPence == null) continue;
    if (best == null || line.costPence < (best.costPence ?? Infinity)) best = line;
  }
  return best;
}
