// Which brakes a car has on each axle, from NAPA's own answers (2026-11-18).
//
// HaynesPro lists a model's repairs for every version of it, so a Fiesta with
// rear drums (FN60KYP) still offers "Renew the Rear Brake Pads and Discs",
// which could only ever go to a quote. Brad: "if that vehicle doesn't have
// rear discs - shouldn't the repair not show?"
//
// The evidence has to be NAPA's, and both halves of it, or nothing is decided
// (a gap in NAPA's range must still go to a quote, never vanish):
//   - drums on an axle: NAPA's EXACT match for the car (the standard quote,
//     not the model-wide catalogue) lists discs or pads, none for that axle,
//     AND NAPA lists drums or shoes for it. FN60KYP: discs and pads front only;
//     drums and shoes rear.
//   - discs on an axle: the exact match lists discs or pads for it, AND NAPA
//     answered about drums and shoes with none for it. LP17BJY: discs and
//     pads front and rear, no drums.
// Anything else (no answer, both listed, as with handbrake shoes inside rear
// discs) leaves the axle unknown and every repair showing as before. Pure.

import type { AagPartOffers } from "./aag-part-prices";
import type { PartPosition, SupplierOffer } from "./supplier-offer";

export const BRAKE_DISC = 82;
export const BRAKE_PADS = 402;
export const BRAKE_DRUM = 123;
export const BRAKE_SHOES = 70;

/** The part types the layout is read from. */
export const BRAKE_PART_TYPES: readonly number[] = [BRAKE_DISC, BRAKE_PADS, BRAKE_DRUM, BRAKE_SHOES];

const DISC_SIDE = new Set([BRAKE_DISC, BRAKE_PADS]);
const DRUM_SIDE = new Set([BRAKE_DRUM, BRAKE_SHOES]);

export type BrakeKind = "disc" | "drum";

export interface BrakeLayout {
  front: BrakeKind | null;
  rear: BrakeKind | null;
}

function offersOf(answers: ReadonlyMap<number, AagPartOffers>, ids: Iterable<number>, exactOnly: boolean): SupplierOffer[] {
  const out: SupplierOffer[] = [];
  for (const id of ids) {
    const answer = answers.get(id);
    if (answer?.state !== "ok") continue;
    for (const offer of answer.offers) {
      if (exactOnly && (offer.fromCatalogue || offer.modelPart)) continue;
      out.push(offer);
    }
  }
  return out;
}

/** Whether NAPA answered at all (parts, or plainly none) for any of these part types. */
function answered(answers: ReadonlyMap<number, AagPartOffers>, ids: Iterable<number>): boolean {
  return [...ids].some((id) => {
    const state = answers.get(id)?.state;
    return state === "ok" || state === "empty";
  });
}

export function brakeLayout(answers: ReadonlyMap<number, AagPartOffers>): BrakeLayout {
  const exactDisc = offersOf(answers, DISC_SIDE, true).filter((o) => o.position);
  const drum = offersOf(answers, DRUM_SIDE, false);
  const drumKnown = answered(answers, DRUM_SIDE);
  const axle = (position: PartPosition): BrakeKind | null => {
    const discHere = exactDisc.some((o) => o.position === position);
    const drumHere = drum.some((o) => o.position === position);
    if (discHere && !drumHere && drumKnown) return "disc";
    if (!discHere && exactDisc.length > 0 && drumHere) return "drum";
    return null;
  };
  return { front: axle("front"), rear: axle("rear") };
}

/**
 * Whether a part type can't be on this axle of this car: discs or pads where
 * it has drums, drums or shoes where it has discs. Pure.
 */
export function notFittedOnCar(genartId: number, position: PartPosition | null, layout: BrakeLayout | null | undefined): boolean {
  if (!position || !layout) return false;
  const kind = layout[position];
  if (kind === "drum") return DISC_SIDE.has(genartId);
  if (kind === "disc") return DRUM_SIDE.has(genartId);
  return false;
}
