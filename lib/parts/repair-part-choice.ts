// Which part a repair uses on one engine variant (Task 45; Alliance Automotive
// only since Task 43).
//
// The default is AAG's best-rated part for that part group on that vehicle,
// the dearest within that rating (owner decision, 2026-09-15). An admin can
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
  defaultOffer,
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
  /** No usable choice, so AAG's best-rated part, dearest within that rating. */
  | { source: "default"; offer: SupplierOffer; missingChoice: MissingChoice | null }
  /** Nothing buyable came back. */
  | { source: "none"; missingChoice: MissingChoice | null };

/** Every offer from the panels that answered. */
export function offersFrom(panels: readonly SupplierPanel[]): SupplierOffer[] {
  return panels.flatMap((panel) => (panel.state === "ok" ? panel.offers : []));
}

export function selectRepairPart(panels: readonly SupplierPanel[], choice: MissingChoice | null): PartSelection {
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
  const best = defaultOffer(offers);
  return best ? { source: "default", offer: best, missingChoice } : { source: "none", missingChoice };
}

/** The axle a HaynesPro job names, or null when it names neither or both. */
export function jobPosition(description: string | null | undefined): PartPosition | null {
  const text = String(description ?? "");
  const front = /\bfront\b/i.test(text);
  const rear = /\brear\b/i.test(text);
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
  return partBuckets(jobDescription, offers).flatMap((bucket) =>
    bySide(bucket, needs).flatMap((slot) => byCylinder(slot, needs)),
  );
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

/**
 * How many of the chosen part a job buys (Task 78). Pure.
 *   - NAPA says how many the car has (plugs): all of them when the job wants
 *     the set, otherwise one.
 *   - Otherwise the supplier's unit of issue (2 for a pair of discs), and at
 *     least 2 on a "both" job whose part NAPA lists once, for either side
 *     (a rear shock absorber): Brad, 2026-11-18.
 */
export function slotQuantity(jobDescription: string | null | undefined, slot: Pick<PartSlot, "side">, offer: SupplierOffer, slotsOnAxle: number): number {
  const needs = jobNeeds(jobDescription);
  if (offer.perVehicle && offer.perVehicle > 0) return wantsSet(needs) ? offer.perVehicle : 1;
  const unit = offer.quantityOfFit && offer.quantityOfFit > 0 ? offer.quantityOfFit : 1;
  if (needs.count === "both" && !needs.side && !slot.side && slotsOnAxle === 1) return Math.max(unit, 2);
  return unit;
}

export interface JobPartSelection {
  position: PartPosition | null;
  /** ADDITIVE (Task 78). The side, when the job takes one part per side. */
  side?: PartSide | null;
  selection: PartSelection;
  /** ADDITIVE (Task 78). How many of the chosen part the job buys. 1 when nothing was chosen. */
  quantity?: number;
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
): JobPartSelection[] {
  const slots = partSlots(jobDescription, offers);
  const home = choice
    ? slots.findIndex((b) => b.offers.some((o) => o.supplier === choice.supplier && o.partNumber === choice.part_number))
    : -1;
  return slots.map((slot, index) => {
    const selection = selectRepairPart(
      [{ state: "ok", offers: slot.offers }],
      index === home || (home === -1 && index === 0) ? choice : null,
    );
    const slotsOnAxle = slots.filter((s) => s.position === slot.position).length;
    return {
      position: slot.position,
      side: slot.side,
      selection,
      quantity: selection.source === "none" ? 1 : slotQuantity(jobDescription, slot, selection.offer, slotsOnAxle),
    };
  });
}
