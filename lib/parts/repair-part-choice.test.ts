import { describe, expect, it } from "vitest";

import { selectRepairPart } from "./repair-part-choice";
import { dearestOffer, type SupplierOffer, type SupplierPanel } from "./supplier-offer";

const offer = (supplier: "lkq" | "aag", partNumber: string, costPence: number | null, buyable = true): SupplierOffer => ({
  supplier,
  groupKey: partNumber,
  partNumber,
  description: null,
  brand: `Brand ${partNumber}`,
  tier: null,
  costPence,
  surchargePence: null,
  rrpPence: null,
  availability: [],
  totalQty: null,
  fitment: [],
  quantityOfFit: null,
  imageUrl: null,
  notes: [],
  buyable,
});

const panel = (...offers: SupplierOffer[]): SupplierPanel => ({
  state: "ok",
  offers,
  cheapestPartNumber: null,
  notFound: [],
  cached: false,
});

describe("dearestOffer", () => {
  it("is the most expensive part we can actually buy", () => {
    const offers = [offer("lkq", "A", 3000), offer("lkq", "B", 9000, false), offer("aag", "C", 4500), offer("aag", "D", null)];
    expect(dearestOffer(offers)?.partNumber).toBe("C");
    expect(dearestOffer([offer("lkq", "B", 9000, false)])).toBeNull();
  });
});

describe("selectRepairPart", () => {
  const lkq = panel(offer("lkq", "L1", 2766), offer("lkq", "L2", 4354));
  const aag = panel(offer("aag", "A1", 3085));

  it("defaults to the dearest across both suppliers", () => {
    expect(selectRepairPart([lkq, aag], null)).toMatchObject({ source: "dearest", offer: { partNumber: "L2" }, missingChoice: null });
  });

  it("uses the admin's choice when it is in today's results", () => {
    const choice = { supplier: "aag" as const, part_number: "A1", brand: null, description: null };
    expect(selectRepairPart([lkq, aag], choice)).toMatchObject({ source: "choice", offer: { partNumber: "A1" } });
  });

  it("matches a choice on supplier as well as part number", () => {
    const choice = { supplier: "aag" as const, part_number: "L2", brand: null, description: null };
    expect(selectRepairPart([lkq, aag], choice).source).toBe("dearest");
  });

  it("falls back to the dearest and reports a chosen part that has gone", () => {
    const choice = { supplier: "lkq" as const, part_number: "GONE", brand: "Brembo", description: "Disc" };
    expect(selectRepairPart([lkq, aag], choice)).toMatchObject({
      source: "dearest",
      offer: { partNumber: "L2" },
      missingChoice: { supplier: "lkq", part_number: "GONE", brand: "Brembo" },
    });
  });

  it("ignores suppliers that didn't answer, and says so when nothing is buyable", () => {
    const down: SupplierPanel = { state: "not_connected", message: "down", hint: null, href: null };
    expect(selectRepairPart([down, aag], null)).toMatchObject({ source: "dearest", offer: { partNumber: "A1" } });
    expect(selectRepairPart([down], null)).toEqual({ source: "none", missingChoice: null });
  });
});
