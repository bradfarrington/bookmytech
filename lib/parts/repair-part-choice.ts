// Which part a repair uses on one engine variant (Task 45; Alliance Automotive
// only since Task 43).
//
// The default is the part the admin's pick rule prefers (Task 85, under
// Pricing: price, rating and stock; supplier-offer.ts). Until it is set, AAG's
// best-rated part, the dearest within that rating (owner decision,
// 2026-09-15). An admin can
// change it on the vehicle's model page; the choice is stored per engine
// variant + repair + part group (`repair_part_choices`, migration 0067) as the
// part's identity — supplier and part number — never its price, so the price
// is always today's.
//
// If the chosen part isn't in today's results (withdrawn, or AAG didn't
// answer), the default is used and the missing choice is reported rather than
// silently forgotten.
//
// Axles: one AAG quote for a part group lists the parts for both axles. A job
// that names an axle ("Renew the front brake pads") takes that axle's parts; a
// job that names neither, on a part group AAG lists for both axles, needs one
// part per axle.
//
// Pure: no I/O.

import {
  compareStockAndRating,
  DEFAULT_PART_PICK_RULE,
  defaultOffer,
  type PartPickRule,
  type PartPosition,
  type PartSide,
  type SupplierId,
  type SupplierOffer,
  type SupplierPanel,
} from "./supplier-offer";

/** A row of `repair_part_choices` (migration 0067). */
export interface RepairPartChoiceRow {
  car_type_id: number;
  node_id: string;
  genart_id: number;
  supplier: SupplierId;
  part_number: string;
  brand: string | null;
  description: string | null;
  chosen_at: string;
}

export type MissingChoice = Pick<RepairPartChoiceRow, "supplier" | "part_number" | "brand" | "description">;

export type PartSelection =
  /** The admin's chosen part, found in today's results. */
  | { source: "choice"; offer: SupplierOffer }
  /** No usable choice, so the part the pick rule prefers (Task 85). */
  | { source: "default"; offer: SupplierOffer; missingChoice: MissingChoice | null }
  /** Nothing buyable came back. */
  | { source: "none"; missingChoice: MissingChoice | null };

/** Every offer from the panels that answered. */
export function offersFrom(panels: readonly SupplierPanel[]): SupplierOffer[] {
  return panels.flatMap((panel) => (panel.state === "ok" ? panel.offers : []));
}

/**
 * What we know about the car that decides between NAPA's alternatives
 * (2026-11-18): a sports model takes sports suspension parts, any other car
 * the standard ones.
 */
export interface CarTraits {
  sports: boolean;
  /**
   * ADDITIVE (Task 87). Whether the car has air-con, as the customer told us.
   * Null or absent: not known (not asked, or "Not sure"). Nothing we look up
   * says: not HaynesPro, NAPA, DVLA or the MOT history.
   */
  airCon?: boolean | null;
  /** ADDITIVE (Task 87). Likewise stop-start. */
  stopStart?: boolean | null;
}

/** Equipment that decides between NAPA's alternatives, and that only the customer (or the car) can tell us. */
export type EquipmentKey = "air_con" | "stop_start";

export const EQUIPMENT_KEYS: readonly EquipmentKey[] = ["air_con", "stop_start"];

/** The offer field and the car's answer for each piece of equipment. */
const EQUIPMENT_FIELD = { air_con: "airCon", stop_start: "stopStart" } as const satisfies Record<EquipmentKey, keyof SupplierOffer & keyof CarTraits>;

function offerEquipment(offer: SupplierOffer, key: EquipmentKey): boolean | null {
  return offer[EQUIPMENT_FIELD[key]] ?? null;
}

export function carEquipment(car: CarTraits | null | undefined, key: EquipmentKey): boolean | null {
  return car?.[EQUIPMENT_FIELD[key]] ?? null;
}

/** "With air-con", "Without stop-start". */
export function equipmentLabel(key: EquipmentKey, has: boolean): string {
  const name = key === "air_con" ? "air-con" : "stop-start";
  return `${has ? "With" : "Without"} ${name}`;
}

/**
 * What decides between a job's part versions (Task 87): equipment the
 * customer is asked about, or "car": a detail only someone at the car can
 * check (engine code, electronic handbrake, tailgate…), never asked.
 */
export type FitDependsOn = EquipmentKey | "car";

/** One of the parts a job could need, when the car's equipment decides which (Task 87). */
export interface FitOption {
  supplier: SupplierId;
  partNumber: string;
  brand: string | null;
  description: string | null;
  /** The equipment it's for: { air_con: true }. */
  for: Partial<Record<EquipmentKey, boolean>>;
  /** "With air-con", or "With air-con, without stop-start", or NAPA's car details ("Engine SPJC"). */
  label: string;
}

/**
 * The parts a job could need when NAPA lists one for cars with the equipment
 * and one for cars without. Unanswered, the job is priced at the dearer, and
 * the mechanic is told both (Brad, 2026-11-27); answered, the customer's, and
 * the mechanic still sees the others.
 */
export interface FitOptions {
  dependsOn: FitDependsOn[];
  options: FitOption[];
  /**
   * The customer's answers, for the equipment they answered: the part charged
   * is the one for that car, and the others are what to buy if they were
   * wrong. A key absent from here is unknown: the part is the dearest.
   */
  answered?: Partial<Record<EquipmentKey, boolean>>;
}

/**
 * Parts for equipment the car doesn't have go, once the customer has said
 * (Task 87): with air-con, the "-AC" belt is out. Parts that fit either stay.
 * Never empties the list. Pure.
 */
export function forEquipment(offers: readonly SupplierOffer[], car: CarTraits | null | undefined): readonly SupplierOffer[] {
  let kept = offers;
  for (const key of EQUIPMENT_KEYS) {
    const has = carEquipment(car, key);
    if (has == null) continue;
    const narrowed = kept.filter((o) => offerEquipment(o, key) == null || offerEquipment(o, key) === has);
    if (narrowed.length > 0) kept = narrowed;
  }
  return kept;
}

/**
 * Parts NAPA's chassis note rules out for this car's VIN go (Task 87: a VW
 * Transporter's belt changes at chassis 7H-6H079890). Never empties the list. Pure.
 */
export function forChassis(offers: readonly SupplierOffer[]): readonly SupplierOffer[] {
  const kept = offers.filter((o) => o.chassis?.fits !== false && !(o.carNotes ?? []).some((n) => n.fits === false));
  return kept.length > 0 ? kept : offers;
}

/** The car details on a part that nothing has settled, as one key: "" when there are none. */
function openCarNotes(offer: SupplierOffer): string {
  const open = (offer.carNotes ?? []).filter((n) => n.fits !== true).map((n) => n.text);
  if (offer.chassis && offer.chassis.fits !== true) open.push(`Chassis ${offer.chassis.note}`);
  return [...new Set(open)].sort().join("; ");
}

/**
 * NAPA's versions of a part for different cars that only someone at the car
 * can tell apart (Task 87): engine code (a Fiesta 1.4's SPJA and SPJC), an
 * electronic handbrake, a tailgate or back doors. The part each kind of car
 * would take, priced at the dearest so the customer never pays more than
 * quoted, with every one listed for the mechanic in NAPA's words. A part
 * with no car detail fits any of them. Null when every kind takes the same
 * part. Pure.
 */
function carVariantOptions(
  jobDescription: string | null | undefined,
  slot: PartSlot,
  choice: MissingChoice | null,
  missingChoice: MissingChoice | null,
  slotsOnAxle: number,
  rule: PartPickRule,
): Pick<JobPartSelection, "selection" | "quantity" | "fitOptions"> | null {
  const buyable = slot.offers.filter((o) => o.buyable && o.costPence != null);
  const keys = [...new Set(buyable.map(openCarNotes).filter(Boolean))];
  if (keys.length === 0) return null;
  const any = slot.offers.filter((o) => openCarNotes(o) === "");
  // Each detail's parts, with those that fit any car; and, when there are
  // such parts, a car with none of the details.
  const groups = keys.map((key) => ({ label: key, offers: [...slot.offers.filter((o) => openCarNotes(o) === key), ...any] }));
  if (any.some((o) => o.buyable && o.costPence != null)) groups.push({ label: "Any other", offers: any });
  const picks: Array<{ label: string; offer: SupplierOffer; source: "choice" | "default"; quantity: number | null; line: number }> = [];
  for (const group of groups) {
    const inGroup = choice && group.offers.some((o) => o.supplier === choice.supplier && o.partNumber === choice.part_number) ? choice : null;
    const selection = selectRepairPart([{ state: "ok", offers: group.offers }], inGroup, rule);
    if (selection.source === "none" || selection.offer.costPence == null) continue;
    const quantity = slotQuantity(jobDescription, slot, selection.offer, slotsOnAxle);
    picks.push({ label: group.label, offer: selection.offer, source: selection.source, quantity, line: selection.offer.costPence * (quantity ?? 1) });
  }
  const distinct = [...new Map(picks.map((p) => [`${p.offer.supplier}:${p.offer.partNumber}`, p])).values()];
  if (distinct.length < 2) return null;
  const dearest = distinct.reduce((a, b) => (b.line > a.line ? b : a));
  return {
    selection:
      dearest.source === "choice" ? { source: "choice", offer: dearest.offer } : { source: "default", offer: dearest.offer, missingChoice },
    quantity: dearest.quantity,
    fitOptions: {
      dependsOn: ["car"],
      options: distinct.map((p) => ({
        supplier: p.offer.supplier,
        partNumber: p.offer.partNumber,
        brand: p.offer.brand,
        description: p.offer.description,
        for: {},
        label: p.label,
      })),
    },
  };
}

/** The equipment, not yet known, that NAPA's buyable parts here split on: some for cars with it, some without. Pure. */
export function equipmentSplit(offers: readonly SupplierOffer[], car: CarTraits | null | undefined): EquipmentKey[] {
  const buyable = offers.filter((o) => o.buyable && o.costPence != null);
  return EQUIPMENT_KEYS.filter(
    (key) =>
      carEquipment(car, key) == null &&
      buyable.some((o) => offerEquipment(o, key) === true) &&
      buyable.some((o) => offerEquipment(o, key) === false),
  );
}

/**
 * HaynesPro's name for the car says it's a sports model: "FORD Fiesta Mk VI
 * 1.6 ST", "BMW X3 (G01) M Competition", "AUDI TT RS", "VW Golf GTI". Chassis
 * codes in brackets are ignored (the Vauxhall Adam is "(M13)"). HaynesPro
 * lists cars by engine, not trim, so a Leon FR reads as a standard Leon. Pure.
 */
export function isSportsModel(description: string | null | undefined): boolean {
  const text = String(description ?? "").replace(/\([^)]*\)/g, " ");
  return /\b(ST|ST-?\d|RS|RS\s?\d|GTI|GTD|VXR|OPC|Cupra|AMG|Type R|JCW|John Cooper Works|Abarth|Nismo|M Competition|M Performance|M[2-8]|S[1-8]|SQ[2-8])\b/.test(text);
}

/**
 * NAPA's standard and sports suspension parts for the same job are
 * alternatives (FN60KYP: a KYB "Standard" spring at £19.87 beside a "Sport"
 * one at £27.30), and "Best, dearest" took the sports one. Keep the ones for
 * this car's suspension, and any that fit either. Pure.
 */
export function forSuspension(offers: readonly SupplierOffer[], car: CarTraits | null | undefined): readonly SupplierOffer[] {
  const wanted = car?.sports ? "sport" : "standard";
  if (!offers.some((o) => o.suspension === wanted)) return offers;
  return offers.filter((o) => !o.suspension || o.suspension === wanted);
}

export function selectRepairPart(
  panels: readonly SupplierPanel[],
  choice: MissingChoice | null,
  rule: PartPickRule = DEFAULT_PART_PICK_RULE,
): PartSelection {
  const offers = offersFrom(panels);
  if (choice) {
    const chosen = offers.find((o) => o.supplier === choice.supplier && o.partNumber === choice.part_number);
    if (chosen) return { source: "choice", offer: chosen };
  }
  const missingChoice: MissingChoice | null = choice
    ? {
        supplier: choice.supplier,
        part_number: choice.part_number,
        brand: choice.brand,
        description: choice.description,
      }
    : null;
  const best = defaultOffer(sensiblePacks(offers, rule), rule);
  return best ? { source: "default", offer: best, missingChoice } : { source: "none", missingChoice };
}

/** A pack's size in litres from NAPA's description: "LONGLIFE RED (199L)", "1LTR MOBIL…", "500ML". Pure. */
export function packLitres(description: string | null | undefined): number | null {
  const text = String(description ?? "");
  const ml = /(\d+(?:[.,]\d+)?)\s*ml\b/i.exec(text);
  if (ml) return Number(ml[1].replace(",", ".")) / 1000;
  const l = /(\d+(?:[.,]\d+)?)\s*(?:l|ltrs?|litres?|liters?)\b/i.exec(text);
  return l ? Number(l[1].replace(",", ".")) : null;
}

/**
 * The biggest pack a job is charged for by default (2026-11-18). NAPA sells
 * fluids from 1 litre bottles to 199 litre workshop drums, and "Best, dearest"
 * took the drum: £611.69 of antifreeze to refill a Toyota ProAce. Brake fluid
 * comes in a 1 litre bottle (a bleed uses well under that); anything else
 * (antifreeze, gear and transmission oil) in up to 5 litres.
 */
function packCapLitres(offers: readonly SupplierOffer[]): number {
  return offers.some((o) => /\bbrake fluid\b|\bdot\s?[345]/i.test(o.description ?? "")) ? 1 : 5;
}

/** Bigger than this is a workshop drum (20 litres is the biggest pack sold for one car). */
const DRUM_LITRES = 25;

/**
 * The offers the default is picked from. Workshop drums (199 and 208 litres)
 * are never charged to one car. When NAPA lists a fluid in several pack
 * sizes, only the biggest pack up to the cap (or, with none that small, the
 * smallest), and never one of unknown size beside them (a drum NAPA didn't
 * label). Anything not sold by the litre is left alone. An admin's choice is
 * still honoured whatever its size. Pure.
 */
export function sensiblePacks(
  offers: readonly SupplierOffer[],
  rule: PartPickRule = DEFAULT_PART_PICK_RULE,
): readonly SupplierOffer[] {
  const sized = offers.map((offer) => ({ offer, litres: packLitres(offer.description) }));
  const labelled = sized.filter((s) => s.litres != null);
  if (labelled.length === 0) return unsizedBrakeFluid(offers, rule) ?? offers;
  // One size mentioned among other parts ("…1.6L"?) isn't a range of packs.
  if (labelled.length === 1 && (labelled[0].litres as number) <= DRUM_LITRES) return offers;
  if (labelled.length === 1) return sized.filter((s) => s.litres == null).map((s) => s.offer);
  const packs = sized.filter((s) => s.litres != null && s.litres <= DRUM_LITRES);
  const sizes = new Set(packs.map((s) => s.litres as number));
  if (sizes.size < 2) return packs.map((s) => s.offer);
  const cap = packCapLitres(offers);
  const fits = packs.filter((s) => (s.litres as number) <= cap);
  if (fits.length > 0) {
    // The biggest pack up to the cap: a refill needs the 5 litres, not the
    // 1 litre bottle that happens to be rated higher.
    const biggest = Math.max(...fits.map((s) => s.litres as number));
    return fits.filter((s) => s.litres === biggest).map((s) => s.offer);
  }
  const smallest = Math.min(...sizes);
  return packs.filter((s) => s.litres === smallest).map((s) => s.offer);
}

/**
 * Brake fluid NAPA lists with no size on any bottle (2026-11-23): the
 * cheapest of the bottles the pick rule prefers on stock and rating, whatever
 * its price setting. Febi's range reads just
 * "BRAKE FLUID" (BD26HXH, S28BSW; NAPA's product info says no more), and
 * "Best, dearest" charged its £45.57 bottle for the Puma Gen-E's 1 litre.
 * Every sized brake fluid NAPA lists puts 1 litre at £9.34–£25.12 and 5
 * litres at £33+, so the dear unlabelled ones are the big packs, and the job
 * buys a 1 litre bottle (packCapLitres). Null when it isn't brake fluid.
 * Pure.
 */
function unsizedBrakeFluid(offers: readonly SupplierOffer[], rule: PartPickRule): readonly SupplierOffer[] | null {
  if (packCapLitres(offers) !== 1) return null;
  const priced = offers.filter((o) => o.buyable && o.costPence != null);
  if (priced.length === 0) return null;
  const top = priced.reduce((a, b) => (compareStockAndRating(b, a, rule) < 0 ? b : a));
  const best = priced.filter((o) => compareStockAndRating(o, top, rule) === 0);
  const cheapest = Math.min(...best.map((o) => o.costPence as number));
  return best.filter((o) => o.costPence === cheapest);
}

/**
 * The axle a HaynesPro job names, or null when it names neither or both. The
 * windscreen is the front ("Renew the windscreen wiper blades" took the rear
 * blade too, 2026-11-18); a "rear windscreen" is the rear.
 */
export function jobPosition(description: string | null | undefined): PartPosition | null {
  const text = String(description ?? "");
  const rear = /\brear\b/i.test(text);
  const front = /\bfront\b/i.test(text) || (!rear && /\bwindscreen\b/i.test(text));
  return front === rear ? null : front ? "front" : "rear";
}

export interface PartBucket {
  position: PartPosition | null;
  offers: SupplierOffer[];
}

/**
 * The offers a job chooses between, split by axle. A job naming an axle keeps
 * that axle's parts and any with no stated axle. A job naming neither, whose
 * part group AAG lists for both axles, gets one bucket per axle.
 */
export function partBuckets(jobDescription: string | null | undefined, offers: readonly SupplierOffer[]): PartBucket[] {
  const wanted = jobPosition(jobDescription);
  if (wanted) {
    return [{ position: wanted, offers: offers.filter((o) => o.position === wanted || o.position == null) }];
  }
  const front = offers.filter((o) => o.position === "front");
  const rear = offers.filter((o) => o.position === "rear");
  if (front.length > 0 && rear.length > 0) {
    return [
      { position: "front", offers: front },
      { position: "rear", offers: rear },
    ];
  }
  return [{ position: null, offers: [...offers] }];
}

/**
 * How much of a fluid a job needs, from HaynesPro's capacity for the car
 * (2026-11-18, lib/haynespro/fluid-capacity.ts). Coolant is the cooling
 * system's whole volume, a top-up included (Brad: a top-up charges a full
 * fill); brake fluid is the brake system's.
 */
export interface FluidNeed {
  kind: "coolant" | "brake_fluid";
  litres: number;
}

/** Sold ready to pour in: the whole volume. Otherwise antifreeze is a concentrate mixed 50/50 with water. */
const READY_MIXED = /\b(rtu|ready[\s-]?(to[\s-]?use|mixed?)|pre-?mix(ed)?|premix(ed)?)\b/i;

/** Litres of this product the job needs. Pure. */
export function litresOfProduct(offer: Pick<SupplierOffer, "description">, need: FluidNeed): number {
  if (need.kind !== "coolant") return need.litres;
  return READY_MIXED.test(offer.description ?? "") ? need.litres : need.litres / 2;
}

/**
 * The bottles a job buys when its need in litres is known: of the packs NAPA
 * lists (never a workshop drum), enough of one size to cover the need, at
 * the lowest cost among the packs the pick rule prefers on stock and rating,
 * a bigger pack winning a tie. Always the lowest cost, whatever the price
 * setting: "dearest" would buy five 1 litre bottles for a 5 litre need.
 * A 4.9 litre cooling system takes 2.45 litres of concentrate: one 5 L, or
 * three 1 L if those are dearer. Null when no pack size is known, so the
 * usual pick applies. Pure.
 */
export function fluidPick(
  offers: readonly SupplierOffer[],
  need: FluidNeed,
  rule: PartPickRule = DEFAULT_PART_PICK_RULE,
): { offer: SupplierOffer; quantity: number } | null {
  let best: { offer: SupplierOffer; quantity: number; line: number; litres: number } | null = null;
  for (const offer of offers) {
    const litres = packLitres(offer.description);
    if (litres == null || litres > DRUM_LITRES || !offer.buyable || offer.costPence == null) continue;
    const quantity = Math.max(1, Math.ceil(litresOfProduct(offer, need) / litres - 1e-9));
    const line = offer.costPence * quantity;
    const byRule = best ? compareStockAndRating(offer, best.offer, rule) : -1;
    const better = byRule < 0 || (byRule === 0 && best && (line < best.line || (line === best.line && litres > best.litres)));
    if (better) best = { offer, quantity, line, litres };
  }
  return best ? { offer: best.offer, quantity: best.quantity } : null;
}

/**
 * What a job's wording says about how many it needs (Task 78). HaynesPro is
 * consistent: "Renew both front shock absorbers", "Renew all the glow plugs",
 * "Renew two tail light bulbs", "Renew the front left shock absorber",
 * "Renew the glow plug".
 */
export interface JobNeeds {
  /** The side the job names, or null for neither or both. */
  side: "left" | "right" | null;
  /** "both"/"two", "all", "one", or null when the job doesn't say. */
  count: "both" | "all" | "one" | null;
  /** The job's part is plural ("…the spark plugs"), so it wants the set. */
  plural: boolean;
}

export function jobNeeds(description: string | null | undefined): JobNeeds {
  const text = String(description ?? "");
  const left = /\bleft\b/i.test(text);
  const right = /\bright\b/i.test(text);
  const count = /\b(both|two|pair of)\b/i.test(text)
    ? "both"
    : /\ball\b/i.test(text)
      ? "all"
      : /\bone\b/i.test(text)
        ? "one"
        : null;
  // The last word before any "(…)" or ",": "Renew the right xenon headlight bulb (follow…" → "bulb".
  const head = text.split(/[(,]/)[0].trim().split(/\s+/).pop() ?? "";
  const plural = /[a-z]s$/i.test(head) && !/(ss|us)$/i.test(head);
  return { side: left === right ? null : left ? "left" : "right", count, plural };
}

/** A job that wants every one the car has, not a single one. */
function wantsSet(needs: JobNeeds): boolean {
  if (needs.side || needs.count === "one") return false;
  return needs.count === "both" || needs.count === "all" || needs.plural;
}

/** The two halves of a side pair, and the other half of each. */
const SIDE_PAIRS: ReadonlyArray<readonly [PartSide, PartSide]> = [
  ["left", "right"],
  ["driver", "passenger"],
];

export interface PartSlot {
  position: PartPosition | null;
  /** The side this slot is for, when the job takes one part per side. */
  side: PartSide | null;
  offers: SupplierOffer[];
}

/**
 * The parts a job needs, each chosen from its own offers (Task 78). One slot
 * per axle (partBuckets), then:
 *   - NAPA lists a left and a right part (or driver and passenger): a job
 *     naming a side takes that side's; any other job takes one of each.
 *   - On a job wanting every plug, a plug NAPA lists for one cylinder ("Cyl.
 *     3", a pressure-sensor glow plug) is its own slot beside the others; on
 *     a single-plug job it is left out.
 * Everything else in a slot is an alternative, and one is chosen. Pure.
 */
export function partSlots(jobDescription: string | null | undefined, offers: readonly SupplierOffer[]): PartSlot[] {
  const needs = jobNeeds(jobDescription);
  return partBuckets(jobDescription, offers)
    .flatMap((bucket) => byDrivenUnit(bucket, jobDescription, needs))
    .flatMap((bucket) => bySide(bucket, needs).flatMap((slot) => byCylinder(slot, needs)));
}

/** Jobs on an ancillary drive belt or its pulleys: the ones NAPA's "Driven Unit" decides between. */
const DRIVE_BELT_JOB = /\b(drive belts?|ancillary|auxiliary|v-?belts?|(v-)?ribbed belts?|belt (tensioner|idler|pulley|damper)s?)\b/i;

/**
 * What a belt drives, as the job names it and as NAPA does ("Driven Unit").
 * A job naming none ("Renew the ancillary drive belt") is the main belt, the
 * one that drives the alternator.
 */
const DRIVEN_UNITS: ReadonlyArray<{ job: RegExp; offer: RegExp }> = [
  { job: /\b(coolant|water) pump\b/i, offer: /\b(coolant|water) pump\b/i },
  { job: /\bpower steering\b/i, offer: /\b(power steering|steering pump|p\/?s pump)\b/i },
  { job: /\b(air[\s-]?condition\w*|a\/c|compressor)\b/i, offer: /\b(air[\s-]?con\w*|a\/c|compressor)\b/i },
  { job: /\boil pump\b/i, offer: /\boil pump\b/i },
  { job: /\balternator\b/i, offer: /\balternator\b/i },
];
const MAIN_BELT = /\balternator\b/i;

/**
 * Task 87. A car with more than one ancillary belt (a Peugeot 308 1.2: a
 * 6PK1043 for the alternator, a 3PK576 stretch-fit for the water pump) gets
 * both listed under both belt part types, and NAPA says which drives what.
 * A job naming what its belt drives takes that belt; one naming nothing takes
 * the main (alternator) belt; "Renew all the ancillary drive belts" takes one
 * of each. Only on drive-belt jobs, and only when NAPA names two or more
 * driven units. Pure.
 */
function byDrivenUnit(bucket: PartBucket, jobDescription: string | null | undefined, needs: JobNeeds): PartBucket[] {
  const text = String(jobDescription ?? "");
  const unitOf = (o: SupplierOffer) => o.drivenUnit?.trim().toLowerCase() || null;
  const units = [...new Set(bucket.offers.map(unitOf).filter((u): u is string => !!u))];
  if (units.length < 2 || !DRIVE_BELT_JOB.test(text)) return [bucket];
  if (wantsSet(needs)) {
    return units.map((unit) => ({ position: bucket.position, offers: bucket.offers.filter((o) => unitOf(o) === unit) }));
  }
  const named = DRIVEN_UNITS.find((u) => u.job.test(text));
  const wanted = named ? named.offer : MAIN_BELT;
  const own = bucket.offers.filter((o) => wanted.test(o.drivenUnit ?? ""));
  return [own.length > 0 ? { position: bucket.position, offers: own } : bucket];
}

function bySide(bucket: PartBucket, needs: JobNeeds): PartSlot[] {
  const whole: PartSlot = { position: bucket.position, side: null, offers: bucket.offers };
  const pair = SIDE_PAIRS.find(([a, b]) =>
    bucket.offers.some((o) => o.side === a) && bucket.offers.some((o) => o.side === b),
  );
  if (needs.side) {
    const own = bucket.offers.filter((o) => o.side === needs.side);
    if (own.length > 0) return [{ position: bucket.position, side: needs.side, offers: own }];
    // Neither side listed as such: the parts that name no side, if any.
    const unsided = bucket.offers.filter((o) => !o.side);
    return [unsided.length > 0 ? { ...whole, offers: unsided } : whole];
  }
  // "Renew one tail light bulb": either side will do.
  if (!pair || needs.count === "one") return [whole];
  return pair.map((side) => ({ position: bucket.position, side, offers: bucket.offers.filter((o) => o.side === side) }));
}

function byCylinder(slot: PartSlot, needs: JobNeeds): PartSlot[] {
  const general = slot.offers.filter((o) => !o.cylinder);
  const special = slot.offers.filter((o) => o.cylinder);
  if (special.length === 0 || general.length === 0 || !slot.offers.some((o) => o.perVehicle)) return [slot];
  if (!wantsSet(needs)) return [{ ...slot, offers: general }];
  const cylinders = [...new Set(special.map((o) => o.cylinder as string))];
  return [
    { ...slot, offers: general },
    ...cylinders.map((cylinder) => ({ ...slot, offers: special.filter((o) => o.cylinder === cylinder) })),
  ];
}

/** One per cylinder: a job renewing all of them needs the count, and can't guess it. */
const PER_CYLINDER = /\b(spark plugs|glow plugs|injectors|ignition coils)\b/i;

/**
 * How many of the chosen part a job buys (Task 78). Pure.
 *   - NAPA says how many the car has (plugs): all of them when the job wants
 *     the set, otherwise one.
 *   - A job renewing every plug, injector or coil when NAPA doesn't say how
 *     many: null, unknown. The part is priced by hand rather than charged
 *     once (2026-11-18: injectors).
 *   - Otherwise the supplier's unit of issue (2 for a pair of discs), and at
 *     least 2 on a "both" job whose part NAPA lists once, for either side
 *     (a rear shock absorber): Brad, 2026-11-18.
 */
export function slotQuantity(
  jobDescription: string | null | undefined,
  slot: Pick<PartSlot, "side">,
  offer: SupplierOffer,
  slotsOnAxle: number,
): number | null {
  const needs = jobNeeds(jobDescription);
  if (offer.perVehicle && offer.perVehicle > 0) return wantsSet(needs) ? offer.perVehicle : 1;
  if (wantsSet(needs) && PER_CYLINDER.test(String(jobDescription ?? ""))) return null;
  const unit = offer.quantityOfFit && offer.quantityOfFit > 0 ? offer.quantityOfFit : 1;
  if (needs.count === "both" && !needs.side && !slot.side && slotsOnAxle === 1) return Math.max(unit, 2);
  return unit;
}

export interface JobPartSelection {
  position: PartPosition | null;
  /** ADDITIVE (Task 78). The side, when the job takes one part per side. */
  side?: PartSide | null;
  selection: PartSelection;
  /**
   * ADDITIVE (Task 78). How many of the chosen part the job buys. 1 when
   * nothing was chosen; null when the job needs every one the engine has and
   * NAPA doesn't say how many.
   */
  quantity?: number | null;
  /**
   * ADDITIVE (Task 87). The parts it could be when the car's equipment
   * decides and we don't know it: priced at the dearer, the mechanic told both.
   */
  fitOptions?: FitOptions;
}

/**
 * The parts a job uses from a part group's offers: one per slot (partSlots),
 * each with how many it buys. The admin's choice applies to the slot it
 * belongs to; a choice missing from today's offers is reported once.
 */
export function selectJobParts(
  jobDescription: string | null | undefined,
  offers: readonly SupplierOffer[],
  choice: MissingChoice | null,
  /** The fluid's need in litres, when this part type is one and HaynesPro gave the car's capacity. */
  fluid?: FluidNeed | null,
  /** Standard or sports suspension parts. Standard when unknown. */
  car?: CarTraits | null,
  /** How the default is picked (Task 85). Today's rule when absent. */
  rule: PartPickRule = DEFAULT_PART_PICK_RULE,
): JobPartSelection[] {
  const chosen = (o: SupplierOffer) => !!choice && o.supplier === choice.supplier && o.partNumber === choice.part_number;
  // A part the car's VIN or the customer's answer rules out goes first, an
  // admin's pick included (Task 87). An admin's pick then stands whatever its
  // suspension: only the default is narrowed.
  // `whole` keeps every kind of car's parts for the mechanic's options; the
  // slot itself only this car's, once the customer has said.
  const whole = partSlots(jobDescription, offers)
    .map((slot) => ({ ...slot, offers: [...forChassis(slot.offers)] }))
    .map((slot) => (slot.offers.some(chosen) ? slot : { ...slot, offers: [...forSuspension(slot.offers, car)] }));
  const slots = whole.map((slot) => ({ ...slot, offers: [...forEquipment(slot.offers, car)] }));
  const home = choice
    ? slots.findIndex((b) => b.offers.some((o) => o.supplier === choice.supplier && o.partNumber === choice.part_number))
    : -1;
  return slots.map((slot, index) => {
    const selection = selectRepairPart(
      [{ state: "ok", offers: slot.offers }],
      index === home || (home === -1 && index === 0) ? choice : null,
      rule,
    );
    const slotsOnAxle = slots.filter((s) => s.position === slot.position).length;
    if (fluid) {
      const usingChoice = selection.source === "choice";
      const sized = usingChoice ? null : fluidPick(slot.offers, fluid, rule);
      if (sized) {
        return { position: slot.position, side: slot.side, selection: { source: "default", offer: sized.offer, missingChoice: selection.source === "default" ? selection.missingChoice : null }, quantity: sized.quantity };
      }
      const litres = selection.source === "none" ? null : packLitres(selection.offer.description);
      if (usingChoice && litres) {
        // The admin's bottle, as many as the car takes.
        return { position: slot.position, side: slot.side, selection, quantity: Math.max(1, Math.ceil(litresOfProduct(selection.offer, fluid) / litres - 1e-9)) };
      }
    }
    const depends = fluid ? [] : equipmentSplit(whole[index].offers, null);
    if (depends.length > 0) {
      const missingChoice = selection.source === "choice" ? null : selection.missingChoice;
      const options = equipmentOptions(jobDescription, whole[index], depends, car, index === home ? choice : null, missingChoice, slotsOnAxle, rule);
      if (options) return { position: slot.position, side: slot.side, ...options };
    }
    if (!fluid && depends.length === 0) {
      const missingChoice = selection.source === "choice" ? null : selection.missingChoice;
      const options = carVariantOptions(jobDescription, slot, index === home ? choice : null, missingChoice, slotsOnAxle, rule);
      if (options) return { position: slot.position, side: slot.side, ...options };
    }
    return {
      position: slot.position,
      side: slot.side,
      selection,
      quantity: selection.source === "none" ? 1 : slotQuantity(jobDescription, slot, selection.offer, slotsOnAxle),
    };
  });
}

/**
 * A slot whose parts split on air-con or stop-start (Task 87): the part the
 * pick rule (or the admin's choice) takes for each kind of car, every one
 * listed for the mechanic. Charged: the one for the customer's answer, and
 * where they haven't answered the dearest, so they never pay more than quoted. Parts that fit either kind are in every group. Null when
 * every kind of car would take the same part. Pure.
 */
function equipmentOptions(
  jobDescription: string | null | undefined,
  slot: PartSlot,
  depends: EquipmentKey[],
  car: CarTraits | null | undefined,
  choice: MissingChoice | null,
  missingChoice: MissingChoice | null,
  slotsOnAxle: number,
  rule: PartPickRule,
): Pick<JobPartSelection, "selection" | "quantity" | "fitOptions"> | null {
  const kinds = depends.reduce<Array<Partial<Record<EquipmentKey, boolean>>>>(
    (acc, key) => acc.flatMap((kind) => [{ ...kind, [key]: true }, { ...kind, [key]: false }]),
    [{}],
  );
  const picks: Array<{ kind: Partial<Record<EquipmentKey, boolean>>; offer: SupplierOffer; source: "choice" | "default"; quantity: number | null; line: number }> = [];
  for (const kind of kinds) {
    const group = slot.offers.filter((o) => depends.every((key) => offerEquipment(o, key) == null || offerEquipment(o, key) === kind[key]));
    const inGroup = choice && group.some((o) => o.supplier === choice.supplier && o.partNumber === choice.part_number) ? choice : null;
    const selection = selectRepairPart([{ state: "ok", offers: group }], inGroup, rule);
    if (selection.source === "none" || selection.offer.costPence == null) continue;
    const quantity = slotQuantity(jobDescription, slot, selection.offer, slotsOnAxle);
    picks.push({ kind, offer: selection.offer, source: selection.source, quantity, line: selection.offer.costPence * (quantity ?? 1) });
  }
  // The same part for every kind of car (one that fits either won): nothing to tell apart.
  if (new Set(picks.map((p) => `${p.offer.supplier}:${p.offer.partNumber}`)).size < 2) return null;
  // This car's kind, as far as the customer has said; the dearest of those.
  const answered: Partial<Record<EquipmentKey, boolean>> = {};
  for (const key of depends) {
    const has = carEquipment(car, key);
    if (has != null) answered[key] = has;
  }
  const theirs = picks.filter((p) => depends.every((key) => answered[key] === undefined || p.kind[key] === answered[key]));
  const dearest = (theirs.length > 0 ? theirs : picks).reduce((a, b) => (b.line > a.line ? b : a));
  const options: FitOption[] = picks.map((p) => ({
    supplier: p.offer.supplier,
    partNumber: p.offer.partNumber,
    brand: p.offer.brand,
    description: p.offer.description,
    for: p.kind,
    label: depends.map((key) => equipmentLabel(key, p.kind[key] as boolean)).join(", "),
  }));
  return {
    selection:
      dearest.source === "choice"
        ? { source: "choice", offer: dearest.offer }
        : { source: "default", offer: dearest.offer, missingChoice },
    quantity: dearest.quantity,
    fitOptions: { dependsOn: depends, options, ...(Object.keys(answered).length > 0 ? { answered } : {}) },
  };
}
