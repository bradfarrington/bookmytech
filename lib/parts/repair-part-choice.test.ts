import { describe, expect, it } from "vitest";

import { selectRepairPart } from "./repair-part-choice";
import type { SupplierOffer, SupplierPanel } from "./supplier-offer";

const offer = (partNumber: string, costPence: number | null, buyable = true): SupplierOffer => ({
  supplier: "aag",
  partNumber,
  description: null,
  brand: `Brand ${partNumber}`,
  tier: null,
  costPence,
  surchargePence: null,
  availability: [],
  totalQty: null,
  fitment: [],
  quantityOfFit: null,
  imageUrl: null,
  notes: [],
  buyable,
});

const panel = (...offers: SupplierOffer[]): SupplierPanel => ({ state: "ok", offers });

describe("selectRepairPart", () => {
  const aag = panel(offer("A1", 2766), offer("A2", 4354), offer("A3", 3085));

  it("defaults to the dearest part", () => {
    expect(selectRepairPart([aag], null)).toMatchObject({ source: "dearest", offer: { partNumber: "A2" }, missingChoice: null });
  });

  it("uses the admin's choice when it is in today's results", () => {
    const choice = { supplier: "aag" as const, part_number: "A1", brand: null, description: null };
    expect(selectRepairPart([aag], choice)).toMatchObject({ source: "choice", offer: { partNumber: "A1" } });
  });

  it("falls back to the dearest and reports a chosen part that has gone", () => {
    const choice = { supplier: "aag" as const, part_number: "GONE", brand: "Brembo", description: "Disc" };
    expect(selectRepairPart([aag], choice)).toMatchObject({
      source: "dearest",
      offer: { partNumber: "A2" },
      missingChoice: { supplier: "aag", part_number: "GONE", brand: "Brembo" },
    });
  });

  it("says so when AAG didn't answer or nothing is buyable", () => {
    const down: SupplierPanel = { state: "not_connected", message: "down", hint: null, href: null };
    expect(selectRepairPart([down], null)).toEqual({ source: "none", missingChoice: null });
    expect(selectRepairPart([panel(offer("X", 9000, false))], null)).toEqual({ source: "none", missingChoice: null });
  });
});
