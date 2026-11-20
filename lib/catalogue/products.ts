// Fixed-price products beside the HaynesPro repair tree (Task 31): the
// diagnostics, servicing and pre-purchase inspections Gareth priced by hand.
// Pure — no I/O — so the composition and pricing are unit-tested and shared by
// the customer catalogue (lib/haynespro/catalogue.ts), the quote
// (lib/haynespro/repair-booking.ts) and the admin.
//
// Ids: "p:<uuid>" for a product (bookable, like a HaynesPro leaf or a "b:"
// option); "c:<category>" for one of the three category nodes at the top of
// the catalogue. HaynesPro ids never contain ":", so both are safe. "Repairs"
// itself is HaynesPro's own root, id "root" — drilling into it is exactly the
// catalogue as it was before this task, so the overlay, the admin tree, the
// search walk and the breadcrumbs are untouched.

import { billableHours } from "@/lib/pricing/billable";
import type { CatalogueNode } from "@/lib/haynespro/catalogue";
import { servicePartTypes, type ServicePartType } from "./service-parts";

const PRODUCT_PREFIX = "p:";
const CATEGORY_PREFIX = "c:";

export type ProductCategory = "diagnostics" | "servicing" | "inspection";

export const isProductId = (id: string): boolean => id.startsWith(PRODUCT_PREFIX);
export const productId = (uuid: string): string => `${PRODUCT_PREFIX}${uuid}`;
export const productUuid = (id: string): string => id.slice(PRODUCT_PREFIX.length);
export const isProductCategoryId = (id: string): boolean =>
  id.startsWith(CATEGORY_PREFIX) && PRODUCT_CATEGORIES.some((c) => c.id === id);
export const productCategoryId = (category: ProductCategory): string => `${CATEGORY_PREFIX}${category}`;
export function productCategoryOf(id: string): ProductCategory | null {
  const found = PRODUCT_CATEGORIES.find((c) => c.id === id);
  return found ? found.key : null;
}

export interface ProductCategoryDef {
  key: ProductCategory;
  id: string;
  label: string;
  /** One line under the category at the top of the catalogue. */
  blurb: string;
}

/** In the order they appear under "Repairs" at the top of the catalogue. */
export const PRODUCT_CATEGORIES: readonly ProductCategoryDef[] = [
  {
    key: "diagnostics",
    id: "c:diagnostics",
    label: "Diagnostics",
    blurb: "Warning lights, won't start, strange noises: a mechanic finds the fault",
  },
  {
    key: "servicing",
    id: "c:servicing",
    label: "Servicing",
    blurb: "Interim, full and major services with the right oil for your engine, and DPF cleaning for diesels",
  },
  {
    key: "inspection",
    id: "c:inspection",
    label: "Pre-purchase inspection",
    blurb: "Bronze, Silver or Gold check of a car before you buy it",
  },
];

/** The "Repairs" node at the top of the catalogue — HaynesPro's own root. */
export const REPAIRS_TOP_NODE: CatalogueNode = {
  id: "root",
  description: "Repairs",
  kind: "group",
  billedHours: null,
  pricePence: null,
  summary: "Brakes, clutch, suspension and every other repair, priced from the manufacturer's book time for your car",
};

// --- Rows, as the table holds them -----------------------------------------

export interface CatalogueProductRow {
  id: string;
  category: ProductCategory;
  name: string;
  summary: string | null;
  description: string | null;
  price_pence: number | null;
  /** numeric arrives as a string from PostgREST. */
  labour_hours: number | string | null;
  duration_hours: number | string | null;
  includes_engine_oil: boolean;
  display_order: number | null;
  is_active: boolean;
  /** 0061 (Task 32) — the checklist the mechanic fills in on this product, and the tier of it. */
  checklist_id?: string | null;
  checklist_tier?: string | null;
  /** 0088 (Task 74) — the fuels it's offered for; null or empty = every vehicle. */
  fuel_types?: string[] | null;
  /** 0088 (Task 74) — what the customer reads before booking it; headings, bullets and paragraphs. */
  info_sheet?: string | null;
  /** 0091 (Task 83) — the NAPA part types it buys for the car; null or empty = none. */
  part_genart_ids?: number[] | null;
}

// --- Fuel (Task 74) ---------------------------------------------------------
//
// Some products only make sense for one fuel: a DPF clean for a diesel, spark
// plugs in a petrol's major service. A product names the fuels it's for, and
// the catalogue only lists it for a vehicle of one of them. Two products may
// share a name in a category when their fuels differ — "Major service" for
// petrol and "Major service" for diesel — and the customer only ever sees the
// one that fits their car.

export type FuelFamily = "petrol" | "diesel" | "electric";
export const FUEL_FAMILIES: readonly FuelFamily[] = ["petrol", "diesel", "electric"];

/**
 * HaynesPro's fuel for a car type, as one family. A hybrid carries its
 * combustion fuel ("PETROL"), so it is petrol here; a pure EV is "ELECTRICAL".
 * Null when unknown or something else (LPG, CNG…): such a vehicle sees every
 * product, as it did before fuels existed.
 */
export function fuelFamilyOf(fuelType: string | readonly string[] | null | undefined): FuelFamily | null {
  const fuels = (Array.isArray(fuelType) ? fuelType : [fuelType])
    .map((f) => (typeof f === "string" ? f.toUpperCase().trim() : ""))
    .filter(Boolean);
  if (fuels.some((f) => f.includes("DIESEL"))) return "diesel";
  if (fuels.some((f) => f.includes("PETROL") || f.includes("GASOLINE"))) return "petrol";
  if (fuels.length > 0 && fuels.every((f) => f.startsWith("ELECTRIC"))) return "electric";
  return null;
}

/** A product's fuels, cleaned: known families only, sorted, empty = every vehicle. */
export function productFuels(row: Pick<CatalogueProductRow, "fuel_types">): FuelFamily[] {
  const raw = Array.isArray(row.fuel_types) ? row.fuel_types : [];
  return FUEL_FAMILIES.filter((f) => raw.includes(f));
}

/** Whether a product is offered for a vehicle of this fuel. Unknown fuel sees everything. */
export function productFitsFuel(row: Pick<CatalogueProductRow, "fuel_types">, fuel: FuelFamily | null): boolean {
  const fuels = productFuels(row);
  return fuels.length === 0 || fuel == null || fuels.includes(fuel);
}

/** The products a vehicle of this fuel is offered. */
export function productsForFuel<T extends Pick<CatalogueProductRow, "fuel_types">>(
  rows: readonly T[],
  fuel: FuelFamily | null,
): T[] {
  return rows.filter((r) => productFitsFuel(r, fuel));
}

/**
 * One product per name in each category — for a listing made before the car is
 * known (the homepage). The first in display order stands for the name; the
 * lowest price among them is what "from" should quote.
 */
export function oneProductPerName(rows: readonly CatalogueProductRow[]): CatalogueProductRow[] {
  const seen = new Set<string>();
  const out: CatalogueProductRow[] = [];
  for (const row of [...rows].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.name.localeCompare(b.name),
  )) {
    const key = `${row.category}:${row.name.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function num(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** The engine-oil line priced for one vehicle. */
export interface OilQuote {
  litres: number;
  pencePerLitre: number;
  pence: number;
  /** haynespro = the manufacturer's stated capacity; default = the admin fallback. */
  source: "haynespro" | "default";
  /** Which figure it was, for the receipt — null for the default. */
  label: string | null;
}

export function oilQuoteFor(litres: number, pencePerLitre: number, source: OilQuote["source"], label: string | null): OilQuote {
  const clean = Math.round(Math.max(0, litres) * 10) / 10;
  return { litres: clean, pencePerLitre, pence: Math.round(clean * pencePerLitre), source, label };
}

/** A product as the quote prices it. */
export interface QuotableProduct {
  /** "p:<uuid>" */
  id: string;
  name: string;
  /** Fixed price; null when priced by the hour. */
  pricePence: number | null;
  /** Labour hours at the platform rate; null when fixed. */
  labourHours: number | null;
  /** Visit occupancy. */
  durationHours: number;
  includesEngineOil: boolean;
  category: ProductCategory;
  summary: string | null;
  /** What's included — one item per line. */
  description: string | null;
  /** What the customer reads before booking (Task 74); null when there is none. */
  infoSheet: string | null;
  /**
   * The NAPA parts it buys for the car (Task 83), priced per car on top of
   * the price above. Empty for most products: the price is then the whole price.
   */
  partTypes: ServicePartType[];
}

export function toQuotableProduct(row: CatalogueProductRow): QuotableProduct {
  const fixed = row.price_pence != null && row.price_pence >= 0 ? Math.round(row.price_pence) : null;
  const labour = fixed == null ? num(row.labour_hours) : null;
  return {
    id: productId(row.id),
    name: row.name.trim() || "Service",
    pricePence: fixed,
    labourHours: labour != null && labour > 0 ? labour : null,
    durationHours: Math.max(0.25, num(row.duration_hours) ?? 1),
    includesEngineOil: Boolean(row.includes_engine_oil),
    category: row.category,
    summary: row.summary?.trim() || null,
    description: row.description?.trim() || null,
    infoSheet: row.info_sheet?.trim() || null,
    partTypes: servicePartTypes(row.part_genart_ids),
  };
}

/** One block of an info sheet, as the price page and the email render it. */
export type InfoSheetBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] };

/**
 * An info sheet as blocks. The admin writes plain text: a line starting "## "
 * is a heading, a line starting "- " or "• " is a bullet, a blank line ends a
 * paragraph, anything else is paragraph text.
 */
export function parseInfoSheet(text: string | null | undefined): InfoSheetBlock[] {
  const blocks: InfoSheetBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    paragraph = [];
  };
  for (const rawLine of (text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    const bullet = /^[-•*]\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      if (heading[1].trim()) blocks.push({ type: "heading", text: heading[1].trim() });
    } else if (bullet) {
      flush();
      const last = blocks[blocks.length - 1];
      if (last?.type === "bullets") last.items.push(bullet[1].trim());
      else blocks.push({ type: "bullets", items: [bullet[1].trim()] });
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

/** "What's included" as a list — one item per line of the description. */
export function productIncludes(description: string | null | undefined): string[] {
  return (description ?? "")
    .split(/\r?\n/)
    .map((s) => s.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}

/** The product's own price at this rate, before oil and parts. Null when it can't be priced. */
export function productBasePence(product: QuotableProduct, hourlyRatePence: number): number | null {
  if (product.pricePence != null) return product.pricePence;
  const billed = billableHours(product.labourHours);
  if (billed == null) return null;
  return Math.round(billed * hourlyRatePence);
}

/**
 * A product as the customer sees it in the catalogue: a bookable "repair"
 * node (so a client that knows nothing of products still shows and books it)
 * carrying the ADDITIVE product fields. `billedHours` is the labour hours for
 * an hourly product, else the visit length — so "estimated N hours" stays a
 * true sentence in an older client.
 */
export function toProductNode(
  product: QuotableProduct,
  hourlyRatePence: number,
  oil: OilQuote | null,
): CatalogueNode | null {
  const base = productBasePence(product, hourlyRatePence);
  if (base == null) return null;
  const oilLine = product.includesEngineOil && oil && oil.pence > 0 ? oil : null;
  const billed = product.labourHours != null ? billableHours(product.labourHours) : null;
  return {
    id: product.id,
    description: product.name,
    kind: "repair",
    billedHours: billed ?? product.durationHours,
    pricePence: base + (oilLine?.pence ?? 0),
    productId: productUuid(product.id),
    productCategory: product.category,
    summary: product.summary,
    ...(product.pricePence != null ? { fixedPrice: true as const } : {}),
    durationHours: product.durationHours,
    oil: oilLine,
    // Its NAPA parts (Task 83): until they're priced for the car, a client
    // reads "+ parts" (or offers a quote) the same as for a repair.
    ...(product.partTypes.length > 0 ? { genartIds: product.partTypes.map((t) => t.genartId) } : {}),
  };
}

/** Active products of one category, in display order. */
export function productsInCategory(rows: readonly CatalogueProductRow[], category: ProductCategory): CatalogueProductRow[] {
  return rows
    .filter((r) => r.is_active && r.category === category)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0) || a.name.localeCompare(b.name));
}

/**
 * The top of the catalogue: Repairs (HaynesPro's root) first, then each
 * category that has at least one active product. A category with nothing in
 * it is a dead end and isn't shown.
 */
export function composeTopLevel(rows: readonly CatalogueProductRow[]): CatalogueNode[] {
  const nodes: CatalogueNode[] = [REPAIRS_TOP_NODE];
  for (const category of PRODUCT_CATEGORIES) {
    if (productsInCategory(rows, category.key).length === 0) continue;
    nodes.push({
      id: category.id,
      description: category.label,
      kind: "group",
      billedHours: null,
      pricePence: null,
      productCategory: category.key,
      summary: category.blurb,
    });
  }
  return nodes;
}

/**
 * Resolve chosen "p:" ids to products, in the same order, or null when one is
 * unknown or switched off (all-or-nothing, like the overlay).
 *
 * `fuel` (Task 74): a product that isn't offered for the vehicle's fuel is
 * swapped for the live one of the same name in the same category that is —
 * the homepage, an old link or an older app can carry the petrol "Major
 * service" onto a diesel. With no such twin it's refused like a switched-off one.
 */
export function resolveProducts(
  ids: readonly string[],
  rows: readonly CatalogueProductRow[],
  fuel: FuelFamily | null = null,
): QuotableProduct[] | null {
  const out: QuotableProduct[] = [];
  for (const id of ids) {
    if (!isProductId(id)) return null;
    let row = rows.find((r) => r.id === productUuid(id));
    if (!row || !row.is_active) return null;
    if (!productFitsFuel(row, fuel)) {
      const chosen = row;
      row = rows.find(
        (r) =>
          r.is_active &&
          r.category === chosen.category &&
          r.name.trim().toLowerCase() === chosen.name.trim().toLowerCase() &&
          productFitsFuel(r, fuel),
      );
      if (!row) return null;
    }
    const product = toQuotableProduct(row);
    if (product.pricePence == null && product.labourHours == null) return null;
    out.push(product);
  }
  return out;
}
