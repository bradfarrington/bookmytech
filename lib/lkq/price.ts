// LKQ price and stock maths. Pure — no I/O, no Supabase, safe to import anywhere.
//
// Everything the money rules depend on lives here, because these are the rules
// that decide what a customer is eventually charged:
//
//   1. isNotFound — THE £0.00 TRAP. An unknown part number is NOT an error to
//      LKQ: it answers Status 0 with a blank description, ShowPrice "0.00" and
//      empty Retail/Net1. The documented code 107 "Product not found" never
//      appears. Verified against the live service with part 000000000 on
//      2026-09-11 (fixture: __fixtures__/ecp-getprice-notfound.xml). Without
//      this check a part LKQ has never heard of becomes a free line on a quote.
//
//   2. A BLANK stock figure is "no number given", NOT zero. 101690288 returns
//      every level blank; 333330020 reports NDCFree 195. null vs 0 is the
//      difference between "we don't know" and "none left".
//
//   3. ShowPrice and CustSur are NEVER summed. The docs claim ShowPrice already
//      includes the surcharge; that is unverified and worth up to £59.95 on a
//      starter motor. Until someone confirms it, both figures are carried
//      separately and rendered separately. See docs/06-lkq-parts-api.md §8 Q1.

import type { LkqPriceRow } from "./types";
import { asArray, textAt, type XmlNode } from "./xml";

/** "31.67" → 3167. "" and junk → null. "0.00" → 0, which is meaningful for RRP. */
export function parseMoneyPence(raw: string | null | undefined): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/**
 * "195" → 195. "" → null, NEVER 0 — see rule 2 above. A genuine "0" from LKQ
 * stays 0, because that is a real answer.
 */
export function parseStock(raw: string | null | undefined): number | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * LKQ puts supersession markers in the description free text, e.g.
 * "S/S TO 104592468". Pull the replacement out so it can be surfaced properly
 * rather than shown to someone as part of a product name.
 */
export function stripSupersession(description: string): {
  description: string;
  supersededTo: string | null;
} {
  const text = String(description ?? "").trim();
  const match = /\bS\/S\s+TO\s+([A-Z0-9]+)\b/i.exec(text);
  if (!match) return { description: text, supersededTo: null };
  return {
    description: text.replace(match[0], "").replace(/\s{2,}/g, " ").trim(),
    supersededTo: match[1],
  };
}

/**
 * The ninth character of an ECP part number is a brand/quality suffix and may be
 * a digit OR a letter (7, 8, 9, A, S, W, X all observed). The first eight are the
 * ADS catalogue number the variants laddered from.
 */
export function basePartNoOf(supplierPartNo: string): string {
  return String(supplierPartNo ?? "").trim().slice(0, 8);
}

/**
 * Flatten one `<Part>` node, reading the REAL nesting. The response table in the
 * Pricing doc §8.2 lists these as if flat; they are not:
 *   Quality/QualityDesc  <- QualityDetails
 *   *Free                <- Stock
 *   ShowPrice/CustSur    <- Price, where the doc's <Retail> is RetailPrice
 *                           and its <Net1> is Net1Price.
 */
export function flattenPart(part: XmlNode): LkqPriceRow {
  const supplierPartNo = textAt(part, "SupplierPartNo").trim();
  const { description, supersededTo } = stripSupersession(textAt(part, "FullDesc"));
  const blankToNull = (v: string): string | null => (v.trim() ? v.trim() : null);

  return {
    supplierPartNo,
    basePartNo: basePartNoOf(supplierPartNo),
    shortCode: textAt(part, "ShortCode").trim(),
    description,
    supersededTo,
    brand: blankToNull(textAt(part, "Brand")),
    quality: blankToNull(textAt(part, "QualityDetails.Quality")),
    qualityDesc: blankToNull(textAt(part, "QualityDetails.QualityDesc")),
    showPricePence: parseMoneyPence(textAt(part, "Price.ShowPrice")),
    retailPricePence: parseMoneyPence(textAt(part, "Price.RetailPrice")),
    net1PricePence: parseMoneyPence(textAt(part, "Price.Net1Price")),
    surchargePence: parseMoneyPence(textAt(part, "Price.CustSur")),
    branchFree: parseStock(textAt(part, "Stock.BranchFree")),
    buddyFree: parseStock(textAt(part, "Stock.BuddyFree")),
    rdcFree: parseStock(textAt(part, "Stock.RDCFree")),
    ndcFree: parseStock(textAt(part, "Stock.NDCFree")),
    companyFree: parseStock(textAt(part, "Stock.CompanyFree")),
  };
}

/**
 * THE £0.00 TRAP — see rule 1 at the top of this file.
 *
 * A part LKQ does not recognise comes back with no description, no RRP and no
 * Net1, and a ShowPrice of "0.00". A genuine part always has at least a
 * description. Note the asymmetry that makes this safe: 10459026W is a REAL
 * Brembo Max disc priced £60.93 whose RetailPrice is 0.00 (no published RRP) —
 * it has a description, so it is correctly NOT treated as missing.
 */
export function isNotFound(row: LkqPriceRow): boolean {
  return !row.description && row.retailPricePence == null && row.net1PricePence == null;
}

/** Can this actually be bought on this account? No price = not sellable to us. */
export function isBuyable(row: LkqPriceRow): boolean {
  return row.showPricePence != null && row.showPricePence > 0;
}

/** Total stock across every level, or null when LKQ gave no figures at all. */
export function totalStock(row: LkqPriceRow): number | null {
  const levels = [row.branchFree, row.buddyFree, row.rdcFree, row.ndcFree, row.companyFree];
  if (levels.every((v) => v == null)) return null;
  return levels.reduce<number>((sum, v) => sum + (v ?? 0), 0);
}

/** Named stock levels for display, in the order a branch would think about them. */
export function stockLevels(row: LkqPriceRow): Array<{ label: string; qty: number | null }> {
  return [
    { label: "Branch", qty: row.branchFree },
    { label: "Buddy", qty: row.buddyFree },
    { label: "RDC", qty: row.rdcFree },
    { label: "NDC", qty: row.ndcFree },
    { label: "Company", qty: row.companyFree },
  ];
}

/**
 * Group the flat rows back into per-catalogue-part ladders, cheapest first.
 * One 8-digit ADS number expands to ~8 branded ECP variants; this is what turns
 * that into a budget → OE ladder a mechanic can choose from.
 *
 * Unbuyable variants (no price on this account) are kept — they are real parts
 * and hiding them would misrepresent the range — but sorted last.
 */
export function priceLadder(rows: readonly LkqPriceRow[]): Map<string, LkqPriceRow[]> {
  const byBase = new Map<string, LkqPriceRow[]>();
  for (const row of rows) {
    const key = row.basePartNo || row.supplierPartNo;
    const bucket = byBase.get(key);
    if (bucket) bucket.push(row);
    else byBase.set(key, [row]);
  }
  for (const bucket of byBase.values()) {
    bucket.sort((a, b) => {
      const ap = isBuyable(a) ? (a.showPricePence as number) : Number.POSITIVE_INFINITY;
      const bp = isBuyable(b) ? (b.showPricePence as number) : Number.POSITIVE_INFINITY;
      if (ap !== bp) return ap - bp;
      return a.supplierPartNo.localeCompare(b.supplierPartNo);
    });
  }
  return byBase;
}

/** Cheapest variant we can actually buy, or null when none is priced. */
export function cheapestVariant(rows: readonly LkqPriceRow[]): LkqPriceRow | null {
  let best: LkqPriceRow | null = null;
  for (const row of rows) {
    if (!isBuyable(row)) continue;
    if (!best || (row.showPricePence as number) < (best.showPricePence as number)) best = row;
  }
  return best;
}

/**
 * Dearest buyable variant. Relevant because the quoting rule under discussion is
 * "quote the dearest variant so whichever one the mechanic buys is covered" —
 * see docs/06-lkq-parts-api.md §8. Nothing in this task prices a job with it.
 */
export function dearestVariant(rows: readonly LkqPriceRow[]): LkqPriceRow | null {
  let best: LkqPriceRow | null = null;
  for (const row of rows) {
    if (!isBuyable(row)) continue;
    if (!best || (row.showPricePence as number) > (best.showPricePence as number)) best = row;
  }
  return best;
}

/**
 * Split a parsed `<REPLY>` into found rows and not-found part numbers.
 * The separation is done HERE rather than left to callers so a £0.00 phantom
 * cannot reach a screen by omission.
 */
export function splitParts(reply: XmlNode): { rows: LkqPriceRow[]; notFound: string[] } {
  const parts = asArray(
    (reply as { Parts?: { Part?: XmlNode | XmlNode[] } })?.Parts?.Part,
  );
  const rows: LkqPriceRow[] = [];
  const notFound: string[] = [];
  for (const part of parts) {
    const row = flattenPart(part);
    if (isNotFound(row)) notFound.push(row.supplierPartNo);
    else rows.push(row);
  }
  return { rows, notFound };
}
