// Which repairs a car can't have, from NAPA's answers (2026-11-18). Brad: "if
// that vehicle doesn't have rear discs - shouldn't the repair not show?"

import { describe, expect, it } from "vitest";

import type { AagPartOffers } from "./aag-part-prices";
import { BRAKE_DISC, BRAKE_DRUM, BRAKE_PADS, BRAKE_SHOES, brakeLayout, notFittedOnCar } from "./brake-layout";
import { priceJobParts } from "./quote-parts";
import type { PartPosition, SupplierOffer } from "./supplier-offer";

const offer = (partNumber: string, position: PartPosition | null, over: Partial<SupplierOffer> = {}): SupplierOffer => ({
  supplier: "aag",
  partNumber,
  description: partNumber,
  brand: "B",
  tier: "Best",
  costPence: 3000,
  surchargePence: null,
  availability: [],
  totalQty: null,
  fitment: [],
  quantityOfFit: 1,
  position,
  imageUrl: null,
  notes: [],
  buyable: true,
  ...over,
});
const ok = (...offers: SupplierOffer[]): AagPartOffers => ({ state: "ok", offers, pricedAt: "", lastKnown: false });
const empty: AagPartOffers = { state: "empty", pricedAt: "" };

// FN60KYP, live: exact-match discs and pads front only; drums and shoes rear (from the catalogue).
const fiesta = new Map<number, AagPartOffers>([
  [BRAKE_DISC, ok(offer("DISC-F", "front"))],
  [BRAKE_PADS, ok(offer("PADS-F", "front"))],
  [BRAKE_DRUM, ok(offer("DRUM-R", "rear", { fromCatalogue: true }))],
  [BRAKE_SHOES, ok(offer("SHOE-R", "rear", { fromCatalogue: true }))],
]);
// LP17BJY, live: discs and pads front and rear, no drums.
const proace = new Map<number, AagPartOffers>([
  [BRAKE_DISC, ok(offer("DISC-F", "front"), offer("DISC-R", "rear"))],
  [BRAKE_PADS, ok(offer("PADS-F", "front"), offer("PADS-R", "rear"))],
  [BRAKE_DRUM, empty],
  [BRAKE_SHOES, empty],
]);

describe("brakeLayout", () => {
  it("reads rear drums when the exact match has front discs only and NAPA lists rear drums", () => {
    expect(brakeLayout(fiesta)).toEqual({ front: "disc", rear: "drum" });
  });

  it("reads rear discs when the exact match lists them and NAPA has no drums", () => {
    expect(brakeLayout(proace)).toEqual({ front: "disc", rear: "disc" });
  });

  it("decides nothing on the catalogue's discs alone (a model-wide list, not this car)", () => {
    const layout = brakeLayout(
      new Map([
        [BRAKE_DISC, ok(offer("DISC-F", "front", { fromCatalogue: true }))],
        [BRAKE_DRUM, ok(offer("DRUM-R", "rear"))],
      ]),
    );
    expect(layout.rear).toBeNull();
  });

  it("decides nothing without drum evidence: a gap in NAPA's range still goes to a quote", () => {
    expect(brakeLayout(new Map([[BRAKE_DISC, ok(offer("DISC-F", "front"))]])).rear).toBeNull();
    expect(brakeLayout(new Map([[BRAKE_DISC, ok(offer("DISC-F", "front"))], [BRAKE_DRUM, { state: "unavailable" }]])).rear).toBeNull();
  });

  it("decides nothing when an axle lists both (handbrake shoes inside rear discs)", () => {
    const layout = brakeLayout(
      new Map([
        [BRAKE_DISC, ok(offer("DISC-F", "front"), offer("DISC-R", "rear"))],
        [BRAKE_SHOES, ok(offer("HANDBRAKE-SHOES", "rear"))],
      ]),
    );
    expect(layout.rear).toBeNull();
  });

  it("knows which part types can't be fitted", () => {
    const layout = brakeLayout(fiesta);
    expect(notFittedOnCar(BRAKE_DISC, "rear", layout)).toBe(true);
    expect(notFittedOnCar(BRAKE_PADS, "rear", layout)).toBe(true);
    expect(notFittedOnCar(BRAKE_DISC, "front", layout)).toBe(false);
    expect(notFittedOnCar(BRAKE_DRUM, "rear", layout)).toBe(false);
    expect(notFittedOnCar(BRAKE_DRUM, "rear", brakeLayout(proace))).toBe(true);
    expect(notFittedOnCar(BRAKE_DISC, null, layout)).toBe(false);
  });
});

describe("priceJobParts with the brake layout", () => {
  it("marks the Fiesta's rear discs as not fitted, not as a quote", () => {
    const result = priceJobParts({
      jobs: [{ nodeId: "rear", description: "Renew both rear brake discs", groups: [{ genartId: BRAKE_DISC, label: "Brake disc" }] }],
      offers: fiesta,
      brakes: brakeLayout(fiesta),
    });
    expect(result).toMatchObject({ ok: false, missing: [{ genartId: BRAKE_DISC, position: "rear", reason: "not_fitted" }] });
  });

  it("still quotes a missing part when the layout can't say", () => {
    const result = priceJobParts({
      jobs: [{ nodeId: "rear", description: "Renew both rear brake discs", groups: [{ genartId: BRAKE_DISC, label: "Brake disc" }] }],
      offers: new Map([[BRAKE_DISC, ok(offer("DISC-F", "front"))]]),
      brakes: { front: null, rear: null },
    });
    expect(result).toMatchObject({ ok: false, missing: [{ reason: "not_listed" }] });
  });
});
