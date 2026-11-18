import { describe, expect, it } from "vitest";

import { applyPartsMarkup, partsMarkupRate } from "./parts-markup";
import type { QuotedPart } from "./quote-parts";

const part = (unitPence: number, quantity = 1, over: Partial<QuotedPart> = {}): QuotedPart => ({
  nodeId: "n",
  genartId: 82,
  groupLabel: "Brake disc",
  supplier: "aag",
  partNumber: "BRE09.A968.21",
  brand: "BREMBO",
  description: null,
  imageUrl: null,
  position: "front",
  rating: "Best",
  quantity,
  unitPence,
  linePence: unitPence * quantity,
  source: "default",
  lastKnown: false,
  pricedAt: "2026-11-18T20:00:00.000Z",
  ...over,
});

describe("partsMarkupRate", () => {
  it("is the rate only when the switch is on", () => {
    expect(partsMarkupRate(1, 0.2)).toBe(0.2);
    expect(partsMarkupRate(true, "0.2")).toBe(0.2);
    expect(partsMarkupRate(0, 0.2)).toBe(0);
    expect(partsMarkupRate(undefined, 0.2)).toBe(0);
    expect(partsMarkupRate(1, undefined)).toBe(0);
    expect(partsMarkupRate(1, -0.1)).toBe(0);
    expect(partsMarkupRate(1, 5)).toBe(1);
  });
});

describe("applyPartsMarkup", () => {
  it("marks up each unit and rounds to the penny, keeping the cost", () => {
    // FN60KYP's front discs: 2 × £45.69 at cost; 20% → 2 × £54.83.
    expect(applyPartsMarkup([part(4569, 2)], 0.2)).toEqual([
      expect.objectContaining({ unitPence: 5483, linePence: 10966, costUnitPence: 4569, markupRate: 0.2, quantity: 2 }),
    ]);
  });

  it("changes nothing when it's off", () => {
    const parts = [part(4569, 2)];
    expect(applyPartsMarkup(parts, 0)).toEqual(parts);
  });

  it("marks up estimates and set prices too", () => {
    const out = applyPartsMarkup([part(1000, 1, { source: "estimate" }), part(500, 1, { source: "set_price", supplier: null })], 0.1);
    expect(out.map((p) => p.linePence)).toEqual([1100, 550]);
  });

  it("never marks up twice", () => {
    const once = applyPartsMarkup([part(1000)], 0.2);
    expect(applyPartsMarkup(once, 0.2)[0].unitPence).toBe(1200);
  });
});
