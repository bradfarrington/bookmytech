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

export interface JobPartSelection {
  position: PartPosition | null;
  selection: PartSelection;
}

/**
 * The part (or one per axle) a job uses from a part group's offers. The admin's
 * choice applies to the axle it belongs to; a choice missing from today's
 * offers is reported once.
 */
export function selectJobParts(
  jobDescription: string | null | undefined,
  offers: readonly SupplierOffer[],
  choice: MissingChoice | null,
): JobPartSelection[] {
  const buckets = partBuckets(jobDescription, offers);
  const home = choice
    ? buckets.findIndex((b) => b.offers.some((o) => o.supplier === choice.supplier && o.partNumber === choice.part_number))
    : -1;
  return buckets.map((bucket, index) => ({
    position: bucket.position,
    selection: selectRepairPart(
      [{ state: "ok", offers: bucket.offers }],
      index === home || (home === -1 && index === 0) ? choice : null,
    ),
  }));
}
