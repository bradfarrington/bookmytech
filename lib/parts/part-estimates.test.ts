import { describe, expect, it } from "vitest";

import { describeEstimate, estimatePart, matchesBasis, modelFamily, rowLine, type EstimateRow, type EstimateVehicle } from "./part-estimates";
import type { SupplierOffer } from "./supplier-offer";

const offer = (over: Partial<SupplierOffer>): SupplierOffer => ({
  supplier: "aag",
  partNumber: "P1",
  description: null,
  brand: "BRAND",
  tier: "Better",
  costPence: 1000,
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

const ranger: EstimateVehicle = { reg: "S28BSW", carTypeId: 900, make: "FORD", modelLabel: "FORD Ranger" };
const row = (reg: string, offers: SupplierOffer[], vehicle: EstimateRow["vehicle"]): EstimateRow => ({ reg, genartId: 82, offers, vehicle });

describe("modelFamily", () => {
  it("takes the generation off HaynesPro's model label, keeping make and model apart", () => {
    expect(modelFamily("FORD", "FORD Fiesta Mk VI")).toBe("FIESTA");
    expect(modelFamily("FORD", "FORD Fiesta Mk VII")).toBe("FIESTA");
    expect(modelFamily("FORD", "FORD Ranger")).toBe("RANGER");
    expect(modelFamily("SEAT", "SEAT Leon III (5F)")).toBe("LEON");
    expect(modelFamily("VAUXHALL", "VAUXHALL Corsa D (S07)")).toBe("CORSA");
    expect(modelFamily("VAUXHALL", "VAUXHALL Vivaro Mk III /-Life (K0)")).toBe("VIVARO");
    expect(modelFamily("AUDI", "AUDI A6 /Allroad (4G)")).toBe("A6");
    expect(modelFamily("HONDA", "HONDA Civic X (FK, FC)")).toBe("CIVIC");
    expect(modelFamily("BMW", "BMW 3 (F30, F31, F80)")).toBe("3");
    expect(modelFamily("BMW", "BMW X3 (G01)")).toBe("X3");
    expect(modelFamily("TESLA", "TESLA Model 3")).toBe("MODEL 3");
    expect(modelFamily("FORD", null)).toBeNull();
  });
});

describe("matchesBasis", () => {
  const sameVariant = row("A", [], { carTypeId: 900, make: "FORD", modelLabel: "FORD Ranger" });
  const olderRanger = row("B", [], { carTypeId: 501, make: "Ford", modelLabel: "FORD Ranger (TKE)" });
  const otherModel = row("C", [], { carTypeId: 100, make: "FORD", modelLabel: "FORD Fiesta Mk VI" });
  const unknown = row("D", [], null);

  it("matches the engine variant, then the same make and model of any year, never another model", () => {
    const rows = [sameVariant, olderRanger, otherModel, unknown];
    expect(rows.map((r) => matchesBasis(r, ranger, "variant"))).toEqual([true, false, false, false]);
    expect(rows.map((r) => matchesBasis(r, ranger, "model"))).toEqual([true, true, false, false]);
  });

  it("never matches the same model name under another make", () => {
    expect(matchesBasis(row("E", [], { carTypeId: 1, make: "MAZDA", modelLabel: "MAZDA Ranger" }), ranger, "model")).toBe(false);
  });
});

describe("rowLine", () => {
  const discs = [
    offer({ position: "front", costPence: 4000, quantityOfFit: 2 }),
    offer({ position: "rear", costPence: 3000, quantityOfFit: 2 }),
  ];

  it("takes the axle the job names", () => {
    expect(rowLine("Renew both rear brake discs", "rear", discs)).toEqual({ unitPence: 3000, quantity: 2 });
    expect(rowLine("Renew both front brake discs", null, discs)).toEqual({ unitPence: 4000, quantity: 2 });
  });

  it("takes the dearer axle for a job that names neither", () => {
    expect(rowLine("Renew all the brake discs", null, discs)).toEqual({ unitPence: 4000, quantity: 2 });
  });

  it("has nothing when the car lists nothing usable on that axle", () => {
    expect(rowLine("Renew the rear brake pads", "rear", [offer({ position: "front" })])).toBeNull();
    expect(rowLine("Renew the brake discs", null, [offer({ costPence: null })])).toBeNull();
  });
});

describe("estimatePart", () => {
  const job = { jobDescription: "Renew both front brake discs", position: "front" as const, vehicle: ranger };

  it("uses the closest basis with an answer, dearest line plus 15%, rounded up", () => {
    const estimate = estimatePart({
      ...job,
      rows: [
        row("FIESTA", [offer({ position: "front", costPence: 9999 })], { carTypeId: 100, make: "FORD", modelLabel: "FORD Fiesta" }),
        row("R1", [offer({ position: "front", costPence: 4001, quantityOfFit: 2 })], { carTypeId: 901, make: "FORD", modelLabel: "FORD Ranger" }),
        row("R2", [offer({ position: "front", costPence: 3500, quantityOfFit: 2 })], { carTypeId: 902, make: "FORD", modelLabel: "FORD Ranger" }),
      ],
    });
    expect(estimate).toEqual({ unitPence: 4602, quantity: 2, linePence: 9204, basis: "model", samples: 2 });
  });

  it("uses an older generation of the same model", () => {
    const estimate = estimatePart({
      ...job,
      rows: [row("OLD", [offer({ position: "front", costPence: 2000 })], { carTypeId: 501, make: "FORD", modelLabel: "FORD Ranger (TKE)" })],
    });
    expect(estimate).toMatchObject({ basis: "model", unitPence: 2300, samples: 1 });
  });

  it("never estimates from another model, even of the same make", () => {
    expect(
      estimatePart({
        ...job,
        rows: [
          row("FIESTA", [offer({ position: "front", costPence: 2000 })], { carTypeId: 100, make: "FORD", modelLabel: "FORD Fiesta Mk VI" }),
          row("UNKNOWN", [offer({ position: "front", costPence: 2000 })], null),
        ],
      }),
    ).toBeNull();
  });

  it("skips a same-engine car with nothing on the axle wanted", () => {
    const estimate = estimatePart({
      ...job,
      rows: [
        row("R1", [offer({ position: "rear", costPence: 5000 })], { carTypeId: 900, make: "FORD", modelLabel: "FORD Ranger" }),
        row("R2", [offer({ position: "front", costPence: 2000 })], { carTypeId: 902, make: "FORD", modelLabel: "FORD Ranger" }),
      ],
    });
    expect(estimate).toMatchObject({ basis: "model", unitPence: 2300 });
  });

  it("ignores the car's own answer and gives up when nothing else has a price", () => {
    expect(estimatePart({ ...job, rows: [row("S28BSW", [offer({ position: "front" })], null)] })).toBeNull();
    expect(estimatePart({ ...job, rows: [] })).toBeNull();
  });
});

describe("describeEstimate", () => {
  it("says where an estimate came from", () => {
    expect(describeEstimate({ basis: "model", samples: 3 })).toBe("Estimated from 3 cars of the same model");
    expect(describeEstimate({ basis: "variant", samples: 1 })).toBe("Estimated from 1 car with the same engine");
  });
});
