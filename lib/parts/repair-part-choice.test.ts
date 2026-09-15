import { describe, expect, it } from "vitest";

import { jobPosition, partBuckets, selectJobParts, selectRepairPart } from "./repair-part-choice";
import type { PartPosition, SupplierOffer, SupplierPanel } from "./supplier-offer";

const offer = (partNumber: string, costPence: number | null, over: Partial<SupplierOffer> = {}): SupplierOffer => ({
  supplier: "aag",
  partNumber,
  description: null,
  brand: `Brand ${partNumber}`,
  tier: "Best",
  costPence,
  surchargePence: null,
  availability: [],
  totalQty: null,
  fitment: [],
  quantityOfFit: 1,
  position: null,
  imageUrl: null,
  notes: [],
  buyable: true,
  ...over,
});

const at = (position: PartPosition): Partial<SupplierOffer> => ({ position });

const panel = (...offers: SupplierOffer[]): SupplierPanel => ({ state: "ok", offers });

describe("selectRepairPart", () => {
  const aag = panel(offer("A1", 2766), offer("A2", 4354), offer("A3", 3085));

  it("defaults to the best-rated, dearest part", () => {
    expect(selectRepairPart([aag], null)).toMatchObject({ source: "default", offer: { partNumber: "A2" }, missingChoice: null });
  });

  it("uses the admin's choice when it is in today's results", () => {
    const choice = { supplier: "aag" as const, part_number: "A1", brand: null, description: null };
    expect(selectRepairPart([aag], choice)).toMatchObject({ source: "choice", offer: { partNumber: "A1" } });
  });

  it("falls back to the default and reports a chosen part that has gone", () => {
    const choice = { supplier: "aag" as const, part_number: "GONE", brand: "Brembo", description: "Disc" };
    expect(selectRepairPart([aag], choice)).toMatchObject({
      source: "default",
      offer: { partNumber: "A2" },
      missingChoice: { supplier: "aag", part_number: "GONE", brand: "Brembo" },
    });
  });

  it("says so when AAG didn't answer or nothing is buyable", () => {
    const down: SupplierPanel = { state: "not_connected", message: "down", hint: null, href: null };
    expect(selectRepairPart([down], null)).toEqual({ source: "none", missingChoice: null });
    expect(selectRepairPart([panel(offer("X", 9000, { buyable: false }))], null)).toEqual({ source: "none", missingChoice: null });
  });
});

describe("jobPosition", () => {
  it("reads the axle a HaynesPro job names", () => {
    expect(jobPosition("Renew the front brake pads")).toBe("front");
    expect(jobPosition("Renew both rear brake discs")).toBe("rear");
    expect(jobPosition("Renew the air filter")).toBeNull();
    expect(jobPosition("Renew the front and rear brake pads")).toBeNull();
  });
});

describe("partBuckets", () => {
  const discs = [offer("FR1", 4354, at("front")), offer("RR1", 3085, at("rear")), offer("ANY", 1000)];

  it("keeps the named axle's parts and any with no stated axle", () => {
    expect(partBuckets("Renew both rear brake discs", discs)).toEqual([{ position: "rear", offers: [discs[1], discs[2]] }]);
  });

  it("needs one part per axle when the job names neither and AAG lists both", () => {
    const buckets = partBuckets("Renew the brake discs", discs);
    expect(buckets.map((b) => b.position)).toEqual(["front", "rear"]);
    expect(buckets.map((b) => b.offers.map((o) => o.partNumber))).toEqual([["FR1"], ["RR1"]]);
  });

  it("keeps one bucket when nothing names an axle", () => {
    const filters = [offer("F1", 2910)];
    expect(partBuckets("Renew the air filter", filters)).toEqual([{ position: null, offers: filters }]);
  });
});

describe("selectJobParts", () => {
  const pads = [
    offer("FRONT-BEST", 2837, at("front")),
    offer("REAR-BEST", 2107, at("rear")),
    offer("REAR-GOOD", 1370, { ...at("rear"), tier: "Good" }),
  ];

  it("applies a choice to its own axle only", () => {
    const choice = { supplier: "aag" as const, part_number: "REAR-GOOD", brand: null, description: null };
    const picked = selectJobParts("Renew the brake pads", pads, choice).map(({ position, selection }) => [
      position,
      selection.source,
      selection.source === "none" ? null : selection.offer.partNumber,
    ]);
    expect(picked).toEqual([
      ["front", "default", "FRONT-BEST"],
      ["rear", "choice", "REAR-GOOD"],
    ]);
  });

  it("reports a missing choice once", () => {
    const choice = { supplier: "aag" as const, part_number: "GONE", brand: null, description: null };
    const result = selectJobParts("Renew the brake pads", pads, choice);
    expect(result.filter((r) => r.selection.source !== "choice" && r.selection.missingChoice)).toHaveLength(1);
  });

  it("finds nothing when the named axle has no part", () => {
    expect(selectJobParts("Renew the front brake pads", [offer("REAR", 2107, at("rear"))], null)).toEqual([
      { position: "front", selection: { source: "none", missingChoice: null } },
    ]);
  });
});
