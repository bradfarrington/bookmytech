// Pure helpers over an AAG quote reply (Task 40): flatten the nested
// articles → product options → availability into rows the admin check page
// can render, and turn AAG's decimal pounds into the integer pence the rest
// of the codebase uses. No I/O; unit-tested against the manual's example and
// against captured sandbox replies once those exist.

import type {
  AagArticle,
  AagAvailability,
  AagClassicProduct,
  AagProductOption,
  AagQuoteBody,
  AagQuoteClassicBody,
} from "./types";

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
  /** The article's catalogue picture; every product option for it shares it. */
  imageUrl: string | null;
  /** AAG's own line ref — what an enquiry/order would echo back. */
  requestLineId: string | null;
  productId: string;
  brand: string | null;
  /** As AAG sends it: "Good" | "Better" | "Best" on UAT (the manual says Budget / Standard / Premium). */
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
    imageUrl: /^https?:\/\//i.test(article.ImageUrl?.trim() ?? "") ? article.ImageUrl!.trim() : null,
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

/** "Front Axle" → "FR", "Rear Axle" → "RR"; anything else as AAG sent it. */
function classicFitment(fitment: string | null | undefined): string | null {
  const text = fitment?.trim() ?? "";
  if (/^front\b/i.test(text)) return "FR";
  if (/^rear\b/i.test(text)) return "RR";
  return text || null;
}

/** "best" → "Best": the standard quote's casing, so ratings compare and display the same. */
function classicRating(rating: string | null | undefined): string | null {
  const text = rating?.trim() ?? "";
  return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : null;
}

function classicArticle(product: AagClassicProduct): AagArticle {
  // Classic gives no priority; its branches come back quickest first, so the
  // stocked ones are ranked in that order and an empty branch is never "quickest".
  let rank = 0;
  const availability: AagAvailability[] = (product.stock ?? []).map((s) => {
    const qty = typeof s.count === "number" && s.count > 0 ? s.count : 0;
    const eta = s.deliveryNotes?.trim();
    return {
      AagLocationId: typeof s.aagLocationId === "number" ? s.aagLocationId : null,
      BranchCode: s.branchCode ?? null,
      LocationName: s.branchName ?? null,
      QtyInStock: qty,
      EstDeliveryTime: eta && eta.toUpperCase() !== "N/A" ? eta : null,
      Priority: qty > 0 ? ++rank : null,
    };
  });
  return {
    ArticleProvider: product.supplier?.supplierName ?? null,
    ArticleDescription: product.description ?? null,
    CustomerProductGroup: product.customerProductGroup ? [product.customerProductGroup] : null,
    FittingPosition: classicFitment(product.fitment),
    ImageUrl: product.imageUrl ?? null,
    ArticleProperties: (product.productDetails ?? []).map((d) => ({ Name: d.name ?? null, Value: d.value ?? null })),
    ProductOptions: [
      {
        RequestLineId: product.requestLineId ?? null,
        ProductId: product.productId ?? null,
        Brand: product.supplier?.supplierName ?? null,
        BrandRating: classicRating(product.productRating),
        CustomerPartNumber: product.customerPartNumber ?? null,
        CustomerLockoutRating: product.customerLockoutRating ?? null,
        RecMinOrdQty: product.recMinOrdQty ?? null,
        CostPrice: product.costPrice ?? null,
        Surcharge: product.surcharge ?? null,
        Availability: availability,
      },
    ],
  };
}

/** Which axle a classic product is listed for. */
function classicAxle(product: AagClassicProduct): "front" | "rear" | "any" {
  const position = classicFitment(product.fitment);
  return position === "FR" ? "front" : position === "RR" ? "rear" : "any";
}

/**
 * Detail names and values that restrict a part to some versions of the model:
 * "For vehicles with disc brakes on the rear axle", "TecDoc Engine Number",
 * "For right-hand drive vehicles", "Not for vehicle equipment line: Sport",
 * "Version: New fixing system"… Deliberately broad: a false alarm only means
 * the part isn't priced from the catalogue, never that a wrong part is.
 */
const VEHICLE_CONDITION =
  /for vehicles|braking system|equipment|engine code|engine number|chassis|production|model year|vehicle|from year|to year|transmission|left-hand|right-hand|steering|version|suitable for/i;

/** "Only for article number" pairs a disc with its pads; it says nothing about the car. */
const NOT_A_VEHICLE_CONDITION = /^only for article number$/i;

/** Whether NAPA says a product is only for some versions of the model. */
export function classicHasVehicleCondition(product: AagClassicProduct): boolean {
  return (product.productDetails ?? []).some((detail) => {
    const name = detail.name?.trim() ?? "";
    if (NOT_A_VEHICLE_CONDITION.test(name)) return false;
    return VEHICLE_CONDITION.test(name) || VEHICLE_CONDITION.test(detail.value ?? "");
  });
}

/**
 * The classic products that certainly fit, axle by axle (Task 76). The
 * standard quote is NAPA's exact match for the car; classic lists the model's
 * whole range. An axle's products are kept only when none of them carries a
 * vehicle condition: then every one fits and the usual rules pick between
 * them. A condition on even a lone part ("for vehicles with disc brakes on
 * the rear axle") means it may be for another version, so that axle is
 * dropped rather than guessed. Pure.
 */
export function unambiguousClassic(body: AagQuoteClassicBody | null | undefined): AagQuoteClassicBody {
  const byAxle = new Map<string, AagClassicProduct[]>();
  for (const product of body?.products ?? []) {
    const axle = classicAxle(product);
    byAxle.set(axle, [...(byAxle.get(axle) ?? []), product]);
  }
  const products = [...byAxle.values()].flatMap((list) => (list.some(classicHasVehicleCondition) ? [] : list));
  return { ...body, products };
}

/**
 * A /api/quote/classic reply in /api/quote's shape, one article per product,
 * so everything downstream (flattenQuote, offers, part choice, the price
 * cache) handles both. Classic lists NAPA's whole range for the model, both
 * axles and every engine version; the standard quote has already narrowed to
 * the exact car. Pure.
 */
export function classicToQuoteBody(body: AagQuoteClassicBody | null | undefined): AagQuoteBody {
  return { Articles: (body?.products ?? []).map(classicArticle) };
}
