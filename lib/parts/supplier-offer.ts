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
  aag: "NAPA Auto Parts",
};

/** Which axle a part fits. */
export type PartPosition = "front" | "rear";

/**
 * Which side of the car a part fits, when NAPA says (Task 78): "FR LH" and
 * "FR RH" shock absorbers, "FR DS" and "FR PS" wiper blades. A car needing
 * both sides lists two parts, and a job on both sides buys one of each.
 */
export type PartSide = "left" | "right" | "driver" | "passenger";

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
  /**
   * ADDITIVE (Task 76). True when the part came from NAPA's full catalogue
   * (/api/quote/classic) because the standard quote had nothing. Only
   * unambiguous catalogue answers are used (see unambiguousClassic), so it
   * fits like any other offer; this records where it came from.
   * Absent on offers cached before Task 76.
   */
  fromCatalogue?: boolean;
  /**
   * ADDITIVE (Task 77). The code NAPA was asked under when it isn't
   * HaynesPro's: an approved mapping (part_code_maps). Absent otherwise.
   */
  napaGenart?: number;
  /**
   * ADDITIVE (Task 77). True when an admin picked this part for the car's
   * model because NAPA lists nothing for it (model_part_choices). Priced live
   * from NAPA by part number. Absent otherwise.
   */
  modelPart?: boolean;
  /** ADDITIVE (Task 78). The side NAPA lists the part for. Absent when it names none, or both. */
  side?: PartSide | null;
  /**
   * ADDITIVE (Task 78). How many the car has, when NAPA says: "No of Plugs" on
   * the standard quote, "Required quantity" on the catalogue. 4 spark plugs on
   * a 4-cylinder engine; 3 ordinary glow plugs beside 1 pressure-sensor plug.
   */
  perVehicle?: number | null;
  /** ADDITIVE (Task 78). The one cylinder a part is for ("Cyl. 3"): a pressure-sensor glow plug. */
  cylinder?: string | null;
  /**
   * ADDITIVE (2026-11-18). The suspension NAPA lists the part for: "Suspension
   * Note: Standard" / "Sport" on springs, "Standard/Heavy Duty/Sports" on
   * shock absorbers, a named sports trim ("FR Models"). Null when it fits
   * either ("Standard / Sport") or doesn't say.
   */
  suspension?: Suspension | null;
  /**
   * ADDITIVE (Task 78). Set on offers read with side, perVehicle and cylinder.
   */
  fitRead?: true;
  /**
   * ADDITIVE (2026-11-18). Which reading of NAPA's details made this offer
   * (OFFER_READ_VERSION). A stored answer from an older reading lacks
   * something pricing now uses (sides, plug counts, suspension), so it is
   * asked again rather than used as fresh.
   */
  readVersion?: number;
}

/** Bump when aagOffers reads something new from NAPA's details. 2: suspension (2026-11-18). */
export const OFFER_READ_VERSION = 2;

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
  // "FR LH", "FR DS": the axle comes first, the side after it.
  const code = String(fittingPosition ?? "").trim().toUpperCase().split(/\s+/)[0] ?? "";
  if (code === "FR" || code === "F" || code === "FRONT") return "front";
  if (code === "RR" || code === "R" || code === "REAR") return "rear";
  const text = String(description ?? "");
  const front = /\bfront\b/i.test(text);
  const rear = /\brear\b/i.test(text);
  return front === rear ? null : front ? "front" : "rear";
}

/** Side words in a description. Short codes only count in the fitting position ("PS" is also power steering). */
const SIDE_WORDS: ReadonlyArray<{ side: PartSide; pattern: RegExp }> = [
  { side: "left", pattern: /\b(lh|l\/h|left)\b/i },
  { side: "right", pattern: /\b(rh|r\/h|right)\b/i },
  { side: "driver", pattern: /\bdriver'?s?\b/i },
  { side: "passenger", pattern: /\bpassenger'?s?\b/i },
];
const SIDE_CODES: ReadonlyArray<{ side: PartSide; pattern: RegExp }> = [
  ...SIDE_WORDS,
  { side: "driver", pattern: /\bds\b/i },
  { side: "passenger", pattern: /\bps\b/i },
];

function oneSide(text: string | null | undefined, patterns: typeof SIDE_WORDS): PartSide | null | "several" {
  const found = [...new Set(patterns.filter(({ pattern }) => pattern.test(text ?? "")).map(({ side }) => side))];
  return found.length === 0 ? null : found.length === 1 ? found[0] : "several";
}

/**
 * The side of the car a part is for, from NAPA's fitting position ("FR LH",
 * "FR DS") or else its description ("SHOCK ABS GAS FRONT (LH)", "Tie Rod End
 * Front Axle Left", "(Rear L/H)"). Null when it names none, or more than one
 * ("Bump Stop Front Axle Left, Front Axle Right" fits either). Pure.
 */
export function sideOf(fittingPosition: string | null | undefined, description: string | null | undefined): PartSide | null {
  const fromPosition = oneSide(fittingPosition, SIDE_CODES);
  if (fromPosition === "several") return null;
  if (fromPosition) return fromPosition;
  const fromDescription = oneSide(description, SIDE_WORDS);
  return fromDescription === "several" ? null : fromDescription;
}

export type Suspension = "standard" | "sport" | "heavy_duty";

const SUSPENSION_FIELD = /^(suspension note|standard\/heavy duty\/sports)$/i;
/** A sports trim NAPA names in place of "Sport": Leon "FR Models", Fiesta "ST". */
const SPORTS_TRIM = /\b(sports?|fr|st|rs|gti|gtd|vxr|opc|cupra|amg|type r|m sport)\b/i;

/** The suspension a part is for, from NAPA's article details. Pure. */
export function suspensionOf(properties: ReadonlyArray<{ name: string; value: string }> | undefined): Suspension | null {
  const value = (properties ?? []).find((p) => SUSPENSION_FIELD.test(p.name))?.value.trim() ?? "";
  if (!value) return null;
  const standard = /\bstandard\b/i.test(value);
  const heavy = /\bheavy\b/i.test(value);
  const sport = SPORTS_TRIM.test(value);
  if ([standard, heavy, sport].filter(Boolean).length !== 1) return null;
  return standard ? "standard" : heavy ? "heavy_duty" : "sport";
}

/** "No of Plugs" (standard quote) or "Required quantity" (catalogue): how many the car has. */
const PER_VEHICLE = /^(no\.?\s+of\s+plugs|required\s+quantity)$/i;

/**
 * "Quantity" on an injector (the catalogue's "Quantity: 4" on DN23HFL's
 * injectors). On other parts it can mean the pack, so it only counts here.
 */
const INJECTOR = /\binjector\b/i;

/** How many of a part the car has, when NAPA says. Pure. */
export function perVehicleOf(
  properties: ReadonlyArray<{ name: string; value: string }> | undefined,
  description?: string | null,
): number | null {
  const injector = INJECTOR.test(description ?? "");
  for (const { name, value } of properties ?? []) {
    const counts = PER_VEHICLE.test(name) || (injector && /^quantity$/i.test(name));
    if (!counts || !/^\d+$/.test(value)) continue;
    const n = Number(value);
    if (n >= 1 && n <= 16) return n;
  }
  return null;
}

/** The one cylinder a part is for ("Position": "Cyl. 3"), or null. Pure. */
export function cylinderOf(properties: ReadonlyArray<{ name: string; value: string }> | undefined): string | null {
  const position = (properties ?? []).find((p) => /^position$/i.test(p.name))?.value ?? "";
  return /\bcyl/i.test(position) ? position : null;
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
      side: sideOf(line.fittingPosition, line.article),
      perVehicle: perVehicleOf(line.properties, line.article),
      cylinder: cylinderOf(line.properties),
      suspension: suspensionOf(line.properties),
      fitRead: true as const,
      readVersion: OFFER_READ_VERSION,
    };
  });
}
