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
//   - costPence is the SUPPLIER COST per unit, passed through. The customer's
//     price adds the admin's parts markup when it's switched on (Pricing;
//     lib/parts/parts-markup.ts, 2026-11-18), applied in quoteJobParts only.
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
  /**
   * ADDITIVE (Task 87). What a belt or pulley drives, from NAPA's "Driven
   * Unit": "Water pump", "Alternator". A Peugeot 308 1.2 has two ancillary
   * belts, and NAPA lists both under both belt part types.
   */
  drivenUnit?: string | null;
  /**
   * ADDITIVE (Task 87). Whether the part is for a car with air-con, from
   * NAPA's "Fitment": true for "+AC", false for "-AC". Absent or null when
   * NAPA doesn't say.
   */
  airCon?: boolean | null;
  /** ADDITIVE (Task 87). Likewise stop-start: "FOR STOP-START" / "NOT FOR STOP-START". */
  stopStart?: boolean | null;
  /**
   * ADDITIVE (Task 87). Whether the part is for a car with an electronic
   * handbrake, from NAPA's "Vehicle Detail" ("With Elec. H/B" / "Without
   * Elec. H/B"): rear pads, calipers and hoses. Asked like air-con.
   */
  electricHandbrake?: boolean | null;
  /** ADDITIVE (Task 87). NAPA's own "Fitment" wording, as it gave it. */
  fitmentText?: string | null;
  /**
   * ADDITIVE (Task 87). NAPA's "Chassis Note" ("TO CH. 7H-6H079890") and
   * whether this car's VIN is inside it: null when that can't be told.
   */
  chassis?: { note: string; fits: boolean | null } | null;
  /**
   * ADDITIVE (Task 87). NAPA's details that describe the CAR the part is for,
   * not the part: year built, "Vehicle Detail" ("With Elec.
   * H/B"), "Applic Note" ("Slovakia Production"), gearbox and option codes.
   * `fits` is true / false when the car's VIN or registration date settles it
   * (year built, production country), null when only someone at the car can.
   * Product details (sizes, filter grades, battery grades) are not here.
   */
  carNotes?: CarNote[];
}

/** One detail of the car a part is for (Task 87), as NAPA words it, and whether this car matches it. */
export interface CarNote {
  /** "Engine SPJA", "With Elec. H/B", "Year built: To Dec 1, 2013". */
  text: string;
  fits: boolean | null;
}

/**
 * Bump when aagOffers reads something new from NAPA's details. 2: suspension
 * (2026-11-18). 3: driven unit, air-con, stop-start, chassis (Task 87).
 * 4: the car details (Task 87, carNotes). 5: electronic handbrake.
 */
export const OFFER_READ_VERSION = 5;

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
 * How the default part is picked from NAPA's alternatives (Task 85, set under
 * Admin → Pricing; lib/parts/part-pick-rule.ts loads it). Gareth chooses the
 * combination:
 *   - stock: "in_stock" prefers a part NAPA has in stock anywhere (the branch,
 *     Birmingham or a warehouse); "any" ignores stock.
 *   - rating: the rating wanted. When NAPA has none at it, the nearest above,
 *     then the nearest below; unrated parts last. "any" ignores rating.
 *   - price: the cheapest or the dearest of what's left.
 * Stock comes first, then rating, then price. Nothing is ever ruled out: with
 * nothing in stock, or nothing at the rating, the rest is still priced
 * (Brad, 2026-11-24), so a customer never loses a price to a setting.
 */
export type PickPrice = "cheapest" | "dearest";
export type PickRating = "any" | "best" | "better" | "good";
export type PickStock = "in_stock" | "any";
export interface PartPickRule {
  price: PickPrice;
  rating: PickRating;
  stock: PickStock;
}

/** The rule until an admin sets one: "Best-rated, dearest within", stock ignored (owner decision, 2026-09-15). */
export const DEFAULT_PART_PICK_RULE: PartPickRule = { price: "dearest", rating: "best", stock: "any" };

/** NAPA has some anywhere. Stock is as of NAPA's answer, which is kept up to 12 hours. */
export function inStock(offer: Pick<SupplierOffer, "totalQty">): boolean {
  return (offer.totalQty ?? 0) > 0;
}

const RATING_TARGET: Record<Exclude<PickRating, "any">, number> = { best: 3, better: 2, good: 1 };

/**
 * How far a part's rating is from the one wanted, lower first: the rating
 * itself, then those above it (nearest first), then those below (nearest
 * first), unrated last. Pure.
 */
export function ratingDistance(tier: string | null | undefined, rating: PickRating): number {
  if (rating === "any") return 0;
  const target = RATING_TARGET[rating];
  const rank = ratingRank(tier);
  if (rank === target) return 0;
  return rank > target ? rank - target : 10 + (target - rank);
}

/** Which of two parts the rule prefers on stock and rating, price aside: negative for a. Pure. */
export function compareStockAndRating(
  a: Pick<SupplierOffer, "totalQty" | "tier">,
  b: Pick<SupplierOffer, "totalQty" | "tier">,
  rule: PartPickRule,
): number {
  if (rule.stock === "in_stock") {
    const byStock = Number(inStock(b)) - Number(inStock(a));
    if (byStock !== 0) return byStock;
  }
  return ratingDistance(a.tier, rule.rating) - ratingDistance(b.tier, rule.rating);
}

/** Which of two parts the rule prefers, price included: negative for a. Unpriced parts last. Pure. */
export function compareOffers(a: SupplierOffer, b: SupplierOffer, rule: PartPickRule): number {
  const byRule = compareStockAndRating(a, b, rule);
  if (byRule !== 0) return byRule;
  const la = offerLinePence(a);
  const lb = offerLinePence(b);
  if (la == null || lb == null) return (la == null ? 1 : 0) - (lb == null ? 1 : 0);
  return rule.price === "cheapest" ? la - lb : lb - la;
}

/**
 * The default part for a repair: of the parts we could actually buy, the one
 * the pick rule prefers (Task 85). NAPA's order breaks a tie. Null when
 * nothing is buyable.
 */
export function defaultOffer(
  offers: readonly SupplierOffer[],
  rule: PartPickRule = DEFAULT_PART_PICK_RULE,
): SupplierOffer | null {
  let best: SupplierOffer | null = null;
  for (const offer of offers) {
    if (!offer.buyable || offerLinePence(offer) == null) continue;
    if (!best || compareOffers(offer, best, rule) < 0) best = offer;
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

/** The Task 87 fields: what the part drives, the equipment and chassis it's for. Pure. */
function fitmentOf(
  properties: ReadonlyArray<{ name: string; value: string }> | undefined,
  car: AagVehicleFacts | null | undefined,
): Pick<SupplierOffer, "drivenUnit" | "airCon" | "stopStart" | "fitmentText" | "chassis" | "carNotes" | "electricHandbrake"> {
  const fitment = property(properties, /^fitment$/i);
  const chassisNote = property(properties, /^chassis\s+note$/i);
  return {
    drivenUnit: drivenUnitOf(properties),
    airCon: airConOf(fitment),
    stopStart: stopStartOf(fitment),
    fitmentText: fitment,
    chassis: chassisNote ? { note: chassisNote, fits: chassisFits(chassisNote, car) } : null,
    carNotes: carNotesOf(properties, car),
    electricHandbrake: electricHandbrakeIn(properties),
  };
}

/** A NAPA detail's value by name, or null. */
function property(properties: ReadonlyArray<{ name: string; value: string }> | undefined, name: RegExp): string | null {
  return (properties ?? []).find((p) => name.test(p.name))?.value.trim() || null;
}

/** What a belt or pulley drives ("Driven Unit": "Water pump"), or null. Pure. */
export function drivenUnitOf(properties: ReadonlyArray<{ name: string; value: string }> | undefined): string | null {
  return property(properties, /^driven\s+unit$/i);
}

const AIR_CON = "(?:A\\/?C|AIR[\\s-]?CON(?:DITIONING|DITIONED)?)";
const NO_AIR_CON = new RegExp(`(?:^|[\\s,(/])-\\s*A\\/?C\\b|\\b(?:WITHOUT|NO|NON|NOT\\s+FOR|EXC(?:L(?:UDING)?)?\\.?)[\\s-]*${AIR_CON}\\b`, "i");
const HAS_AIR_CON = new RegExp(`(?:^|[\\s,(/])\\+\\s*A\\/?C\\b|\\b(?:WITH|FOR|INC(?:L(?:UDING)?)?\\.?)\\s+${AIR_CON}\\b`, "i");

/** Air-con from NAPA's "Fitment": "+AC" true, "-AC" false, null when it doesn't say or says both. Pure. */
export function airConOf(fitment: string | null | undefined): boolean | null {
  const text = String(fitment ?? "");
  const no = NO_AIR_CON.test(text);
  // "NOT FOR AC" also reads as "FOR AC": the negative wins on its own words.
  const yes = HAS_AIR_CON.test(text.replace(NO_AIR_CON, " "));
  return no === yes ? null : yes;
}

const STOP_START = "(?:STOP[\\s/-]*START|S\\/S)";
const NO_STOP_START = new RegExp(`(?:^|[\\s,(])-\\s*S\\/S\\b|\\b(?:WITHOUT|NO|NON|NOT\\s+FOR)[\\s-]*${STOP_START}\\b`, "i");
const HAS_STOP_START = new RegExp(`(?:^|[\\s,(])\\+\\s*S\\/S\\b|\\b(?:WITH|FOR)\\s+${STOP_START}\\b`, "i");

/** Stop-start from NAPA's "Fitment": "FOR STOP-START" true, "NOT FOR STOP-START" false, else null. Pure. */
export function stopStartOf(fitment: string | null | undefined): boolean | null {
  const text = String(fitment ?? "");
  const no = NO_STOP_START.test(text);
  const yes = HAS_STOP_START.test(text.replace(NO_STOP_START, " "));
  return no === yes ? null : yes;
}

const E_HANDBRAKE = "(?:elec(?:tric|tronic)?\\.?\\s*(?:h\\/?b|hand\\s*brake|park(?:ing)?\\s*brake)|e-?pb)";
const NO_E_HANDBRAKE = new RegExp(`\\b(?:without|w\\/o|no|non|excl\\.?|not\\s+for)[\\s-]+(?:an?\\s+)?${E_HANDBRAKE}`, "i");
const HAS_E_HANDBRAKE = new RegExp(`\\b(?:with|for(?:\\s+vehicles\\s+with)?|incl\\.?)\\s+(?:an?\\s+)?${E_HANDBRAKE}`, "i");

/** Electronic handbrake from a car detail: "With Elec. H/B" true, "Without Elec. H/B" false, else null. Pure. */
export function electricHandbrakeOf(text: string | null | undefined): boolean | null {
  const t = String(text ?? "");
  const no = NO_E_HANDBRAKE.test(t);
  const yes = HAS_E_HANDBRAKE.test(t.replace(NO_E_HANDBRAKE, " "));
  return no === yes ? null : yes;
}

/** What NAPA's answer says about the car itself (its VehicleDetails). */
export interface AagVehicleFacts {
  vin?: string | null;
  /** Year of manufacture, to read the VIN's model-year letter. */
  year?: number | null;
  /** First registration, "YYYY-MM-DD" (Task 87: year-built ranges). */
  registered?: string | null;
}

/**
 * NAPA details that say which cars a part is for. Matched on the name; the
 * value is the car detail. Engine codes are left out: NAPA tags each part
 * with whichever naming its source uses, so a 2010 Fiesta 1.4 reads C14HDEZ
 * on some parts and SPJC on others (engine-codes.ts), and a different code
 * says nothing about a different engine (2026-11-27: 746 false splits on 12
 * scanned cars). "Fitment" is read for air-con and stop-start only
 * (airConOf): on other parts it describes the part ("Activated Carbon
 * Filter", "Before catalytic converter"). "Note" is left out: it is mostly
 * safety-sheet and fitting-time text.
 */
const CAR_NOTE_FIELDS: ReadonlyArray<{ name: RegExp; label: (value: string) => string; kind: "year" | "other" }> = [
  { name: /^year\s+built$/i, label: (v) => `Built ${v.replace(/\b(From|To)\b/g, (m) => m.toLowerCase())}`, kind: "year" },
  { name: /^vehicle\s+detail$/i, label: (v) => v, kind: "other" },
  { name: /^applic(ation)?\s+note$/i, label: (v) => v.replace(/^\((.*)\)$/, "$1"), kind: "other" },
  { name: /^model\s+detail$/i, label: (v) => v, kind: "other" },
  { name: /^transmission\s+code$/i, label: (v) => `Gearbox ${v}`, kind: "other" },
  { name: /^for\s+pr\s+number$/i, label: (v) => `Factory option ${v}`, kind: "other" },
];

/**
 * Parts of a "Vehicle Detail" that describe the part, not the car: a
 * battery's rated engine starts; model-year and production-date ranges on
 * fluids. Taken out before the rest is read as a car detail.
 */
const NOT_CAR_DETAIL = /\b(engine starts|model year (from|to)|(from|to) prod\. date)\s*:\s*[^;]*;?/gi;

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

/** "To Dec 1, 2013 From Aug 1, 2009" → { to, from } as UTC times. Pure. */
export function yearBuiltRange(value: string): { from: number | null; to: number | null } | null {
  const range = { from: null as number | null, to: null as number | null };
  for (const [, dir, mon, day, year] of value.matchAll(/\b(From|To)\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/gi)) {
    const month = MONTHS[mon.toLowerCase()];
    if (month === undefined) return null;
    const at = Date.UTC(Number(year), month, Number(day));
    if (/^from$/i.test(dir)) range.from = at;
    else range.to = at;
  }
  return range.from == null && range.to == null ? null : range;
}

const YEAR_MS = 365 * 24 * 3600 * 1000;

/**
 * Whether a car first registered on `registered` was built inside NAPA's
 * range. A car is built before it is registered, usually within months, so:
 * registered before "To" → fits; registered before "From" → doesn't; more
 * than a year either side of a limit → settled; nearer → can't tell. Pure.
 */
export function builtInRange(value: string, registered: string | null | undefined): boolean | null {
  const range = yearBuiltRange(value);
  const reg = registered ? Date.parse(`${registered}T00:00:00Z`) : NaN;
  if (!range || Number.isNaN(reg)) return null;
  let fits: boolean | null = true;
  if (range.to != null) {
    if (reg > range.to + YEAR_MS) return false;
    if (reg > range.to) fits = null;
  }
  if (range.from != null) {
    if (reg < range.from) return false;
    if (reg < range.from + YEAR_MS) fits = null;
  }
  return fits;
}

/** VIN world-manufacturer prefixes by country (ISO 3780), for "Slovakia Production" and the like. */
const VIN_COUNTRY: ReadonlyArray<{ country: RegExp; vin: RegExp }> = [
  { country: /\b(south\s+)?korea\b/i, vin: /^K[L-R]/ },
  { country: /\bslovakia\b/i, vin: /^U[5-7]|^TM/ },
  { country: /\bczech\b/i, vin: /^T[J-P]/ },
  { country: /\bjapan\b/i, vin: /^J/ },
  { country: /\b(uk|united kingdom|england|great britain)\b/i, vin: /^S[A-M]/ },
  { country: /\bgermany\b/i, vin: /^W|^S[N-T]/ },
  { country: /\bfrance\b/i, vin: /^V[F-R]/ },
  { country: /\bspain\b/i, vin: /^V[S-W]/ },
  { country: /\bitaly\b/i, vin: /^Z[A-R]/ },
  { country: /\bturkey\b/i, vin: /^N[M-T]/ },
  { country: /\bindia\b/i, vin: /^M[A-E]/ },
  { country: /\bthailand\b/i, vin: /^M[L-R]/ },
  { country: /\bchina\b/i, vin: /^L/ },
  { country: /\bhungary\b/i, vin: /^T[R-V]/ },
  { country: /\bpoland\b/i, vin: /^S[U-Z]/ },
  { country: /\bromania\b/i, vin: /^U[U-Z]/ },
  { country: /\bportugal\b/i, vin: /^T[W-Z1]/ },
  { country: /\bmexico\b/i, vin: /^3/ },
  { country: /\b(usa|united states)\b/i, vin: /^[145]/ },
];

/** Whether a "made in" detail ("Slovakia Production", "Prod. Country: Slovakia") matches the car's VIN; null when it names no country we know. Pure. */
export function madeInFits(value: string, vin: string | null | undefined): boolean | null {
  if (!/\b(production|prod\.|manufacture|made in|country)\b/i.test(value)) return null;
  const v = String(vin ?? "").trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(v)) return null;
  const named = VIN_COUNTRY.filter((c) => c.country.test(value));
  if (named.length !== 1) return null;
  return named[0].vin.test(v);
}

/** Electronic handbrake from NAPA's car details ("Vehicle Detail", "Applic Note"), or null. Pure. */
export function electricHandbrakeIn(properties: ReadonlyArray<{ name: string; value: string }> | undefined): boolean | null {
  const answers = new Set(
    (properties ?? [])
      .filter((p) => /^(vehicle\s+detail|applic(ation)?\s+note)$/i.test(p.name.trim()))
      .map((p) => electricHandbrakeOf(p.value))
      .filter((v): v is boolean => v != null),
  );
  return answers.size === 1 ? [...answers][0] : null;
}

/** NAPA's car details for a part (Task 87), each settled where the car's VIN or registration can. Pure. */
export function carNotesOf(
  properties: ReadonlyArray<{ name: string; value: string }> | undefined,
  car: AagVehicleFacts | null | undefined,
): CarNote[] {
  const notes: CarNote[] = [];
  for (const { name, value } of properties ?? []) {
    const field = CAR_NOTE_FIELDS.find((f) => f.name.test(name.trim()));
    if (!field) continue;
    // An electronic handbrake is asked of the customer (electricHandbrake), not left to the mechanic.
    const detail =
      field.kind === "other"
        ? value
            .replace(NOT_CAR_DETAIL, "")
            .split(/[;,]/)
            .filter((part) => electricHandbrakeOf(part) == null)
            .join(";")
        : value;
    const text = detail.replace(/^[;\s]+|[;\s]+$/g, "").trim();
    if (!text) continue;
    const fits =
      field.kind === "year" ? builtInRange(text, car?.registered) : field.kind === "other" ? madeInFits(text, car?.vin) : null;
    notes.push({ text: field.label(text), fits });
  }
  return notes;
}

/** VIN model-year letters from 1980 ("A") in order; digits 1–9 are 2001–2009. */
const VIN_YEAR_LETTERS = "ABCDEFGHJKLMNPRSTVWXY";

/** The model year a VIN year code stands for, the one of its 30-year cycle nearest `near`. Pure. */
export function vinYear(code: string, near: number): number | null {
  const c = code.toUpperCase();
  const letter = VIN_YEAR_LETTERS.indexOf(c);
  const base = letter >= 0 ? 1980 + letter : /^[1-9]$/.test(c) ? 2000 + Number(c) : null;
  if (base == null) return null;
  return [base, base + 30, base + 60].reduce((a, b) => (Math.abs(b - near) < Math.abs(a - near) ? b : a));
}

/**
 * Whether a car's VIN is inside NAPA's chassis note, for the notes VW group
 * cars carry: "TO CH. 7H-6H079890", "FROM CH. 7H-6H079891" (model 7H, model
 * year 6, plant H, serial 079890; a VIN reads WV1ZZZ7HZ6H079…). Null when
 * the note isn't that shape, the VIN is another model, or the order can't be
 * told (another plant in the same year). Pure.
 */
export function chassisFits(note: string | null | undefined, car: AagVehicleFacts | null | undefined): boolean | null {
  const vin = String(car?.vin ?? "").trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin) || !/^\d{6}$/.test(vin.slice(11))) return null;
  const limits = [...String(note ?? "").matchAll(/\b(FROM|TO|UP\s+TO|UNTIL)\s+CH(?:ASSIS)?\.?\s*(?:NO\.?\s*)?([A-Z0-9]{2})-?([A-Z0-9])([A-Z0-9])(\d{6})\b/gi)];
  if (limits.length === 0) return null;
  const near = car?.year && car.year > 1980 ? car.year : null;
  let fits = true;
  for (const [, dir, model, yearCode, plant, serial] of limits) {
    if (vin.slice(6, 8) !== model.toUpperCase()) return null;
    let order: number;
    if (vin[9] === yearCode.toUpperCase()) {
      if (vin[10] !== plant.toUpperCase()) return null;
      order = Number(vin.slice(11)) - Number(serial);
    } else {
      if (near == null) return null;
      const carYear = vinYear(vin[9], near);
      const noteYear = vinYear(yearCode, near);
      if (carYear == null || noteYear == null) return null;
      order = carYear - noteYear;
    }
    const from = /^from$/i.test(dir);
    if (from ? order < 0 : order > 0) fits = false;
  }
  return fits;
}

/** Map AAG's already-flattened quote lines into the offer shape. */
export function aagOffers(lines: readonly AagQuoteLine[], car?: AagVehicleFacts | null): SupplierOffer[] {
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
      ...fitmentOf(line.properties, car),
      fitRead: true as const,
      readVersion: OFFER_READ_VERSION,
    };
  });
}
