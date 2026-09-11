// Merge two suppliers' offers into one row per part (Task 42).
//
// THE PROBLEM THIS SOLVES. LKQ and AAG number the same physical part
// differently — LKQ calls a Brembo front disc 10459124A, AAG has its own id.
// So a row cannot carry "the price" of a part; it carries one column per
// supplier, each showing THAT supplier's part number and THAT supplier's price.
// A dash means the supplier didn't offer it, which is information too.
//
// HOW ROWS ARE MATCHED, and why it is deliberately conservative: the only thing
// the two catalogues share is the brand and a rough description. Matching on
// brand alone would merge a 302 mm disc with a 278 mm one the moment both came
// back from the same maker. So two offers merge ONLY when they agree on brand
// AND their descriptions carry the same size signature. Anything else stays as
// its own row with the other column empty — an unmatched row is honest, a
// wrongly-merged one quietly compares two different parts.

import type { SupplierId, SupplierOffer, SupplierStockLine } from "./supplier-offer";

export interface ComparisonCell {
  partNumber: string;
  costPence: number | null;
  surchargePence: number | null;
  rrpPence: number | null;
  availability: SupplierStockLine[];
  totalQty: number | null;
  notes: string[];
  buyable: boolean;
}

export interface ComparisonRow {
  key: string;
  /** Best available human name across the suppliers that answered. */
  name: string;
  brand: string | null;
  tier: string | null;
  fitment: Array<{ label: string; value: string }>;
  quantityOfFit: number | null;
  imageUrl: string | null;
  lkq: ComparisonCell | null;
  aag: ComparisonCell | null;
  /** Cheapest of the supplier cells that carry a price. */
  cheapestPence: number | null;
  cheapestSupplier: SupplierId | null;
}

function toCell(offer: SupplierOffer): ComparisonCell {
  return {
    partNumber: offer.partNumber,
    costPence: offer.costPence,
    surchargePence: offer.surchargePence,
    rrpPence: offer.rrpPence,
    availability: offer.availability,
    totalQty: offer.totalQty,
    notes: offer.notes,
    buyable: offer.buyable,
  };
}

export function normaliseBrand(brand: string | null | undefined): string {
  return String(brand ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * The measurements in a description, which are what actually distinguish two
 * discs from the same maker. "FRONT BRAKE DISC FORD RANGER (11-) 302MM (V)"
 * → "302". Falls back to the fitment values when the text carries no number.
 */
export function sizeSignature(
  description: string | null | undefined,
  fitment: ReadonlyArray<{ label: string; value: string }> = [],
): string {
  const fromText = String(description ?? "").match(/\d{2,4}(?:\.\d+)?\s*MM/gi) ?? [];
  if (fromText.length > 0) {
    return fromText.map((m) => m.replace(/[^\d.]/g, "")).sort().join("/");
  }
  const fromFitment = fitment
    .map((f) => f.value)
    .filter((v) => /^\d{2,4}(\.\d+)?$/.test(v.trim()))
    .sort();
  return fromFitment.join("/");
}

/** Brand + size — the only pairing we can make honestly across two catalogues. */
export function matchKey(offer: SupplierOffer): string {
  return `${normaliseBrand(offer.brand)}|${sizeSignature(offer.description, offer.fitment)}`;
}

/**
 * Build the comparison rows.
 *
 * Every LKQ offer becomes a row. An AAG offer joins an existing row only when
 * its brand+size key matches exactly one unclaimed LKQ row; otherwise it gets
 * its own row with the LKQ column empty.
 */
export function buildComparisonRows(
  lkqOffers: readonly SupplierOffer[],
  aagOffers: readonly SupplierOffer[],
): ComparisonRow[] {
  const rows: ComparisonRow[] = lkqOffers.map((offer, index) => ({
    key: `lkq:${offer.partNumber}:${index}`,
    name: offer.description || offer.partNumber,
    brand: offer.brand,
    tier: offer.tier,
    fitment: offer.fitment,
    quantityOfFit: offer.quantityOfFit,
    imageUrl: offer.imageUrl,
    lkq: toCell(offer),
    aag: null,
    cheapestPence: null,
    cheapestSupplier: null,
  }));

  // Index the LKQ rows by match key so an AAG offer can find its counterpart.
  const byKey = new Map<string, number[]>();
  lkqOffers.forEach((offer, index) => {
    const key = matchKey(offer);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(index);
    else byKey.set(key, [index]);
  });

  aagOffers.forEach((offer, index) => {
    const key = matchKey(offer);
    const candidates = (byKey.get(key) ?? []).filter((i) => rows[i].aag === null);

    // Exactly one unclaimed candidate, and a brand we actually know: merge.
    // Anything ambiguous stays separate rather than guessing.
    if (candidates.length === 1 && normaliseBrand(offer.brand)) {
      const row = rows[candidates[0]];
      row.aag = toCell(offer);
      if (!row.imageUrl && offer.imageUrl) row.imageUrl = offer.imageUrl;
      if (row.fitment.length === 0 && offer.fitment.length > 0) row.fitment = offer.fitment;
      return;
    }

    rows.push({
      key: `aag:${offer.partNumber}:${index}`,
      name: offer.description || offer.partNumber,
      brand: offer.brand,
      tier: offer.tier,
      fitment: offer.fitment,
      quantityOfFit: offer.quantityOfFit,
      imageUrl: offer.imageUrl,
      lkq: null,
      aag: toCell(offer),
      cheapestPence: null,
      cheapestSupplier: null,
    });
  });

  for (const row of rows) {
    const lkqPence = row.lkq?.buyable ? row.lkq.costPence : null;
    const aagPence = row.aag?.buyable ? row.aag.costPence : null;
    if (lkqPence != null && (aagPence == null || lkqPence <= aagPence)) {
      row.cheapestPence = lkqPence;
      row.cheapestSupplier = "lkq";
    } else if (aagPence != null) {
      row.cheapestPence = aagPence;
      row.cheapestSupplier = "aag";
    }
  }

  return rows;
}

export type SortKey = "price" | "brand" | "name";

export function sortRows(rows: readonly ComparisonRow[], sort: SortKey): ComparisonRow[] {
  const out = [...rows];
  out.sort((a, b) => {
    if (sort === "brand") return (a.brand ?? "").localeCompare(b.brand ?? "");
    if (sort === "name") return a.name.localeCompare(b.name);
    // Price: unpriced rows sink to the bottom rather than sorting as free.
    const ap = a.cheapestPence ?? Number.POSITIVE_INFINITY;
    const bp = b.cheapestPence ?? Number.POSITIVE_INFINITY;
    return ap - bp;
  });
  return out;
}

/** Brands present in the rows, for the filter. Sorted, no blanks. */
export function brandsOf(rows: readonly ComparisonRow[]): string[] {
  const brands = new Set<string>();
  for (const row of rows) if (row.brand) brands.add(row.brand);
  return [...brands].sort();
}

export interface RowFilter {
  brand: string;
  /** "all" | "lkq" | "aag" — which supplier must carry the part. */
  supplier: string;
  query: string;
}

export function filterRows(
  rows: readonly ComparisonRow[],
  filter: RowFilter,
): ComparisonRow[] {
  const query = filter.query.trim().toLowerCase();
  return rows.filter((row) => {
    if (filter.brand !== "all" && row.brand !== filter.brand) return false;
    if (filter.supplier === "lkq" && !row.lkq) return false;
    if (filter.supplier === "aag" && !row.aag) return false;
    if (query) {
      const haystack = [
        row.name,
        row.brand ?? "",
        row.lkq?.partNumber ?? "",
        row.aag?.partNumber ?? "",
      ]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}
