import { describe, expect, it } from "vitest";

import {
  brandsOf,
  buildComparisonRows,
  filterRows,
  matchKey,
  normaliseBrand,
  sizeSignature,
  sortRows,
} from "./compare-rows";
import type { SupplierOffer } from "./supplier-offer";

const offer = (over: Partial<SupplierOffer> = {}): SupplierOffer => ({
  supplier: "lkq",
  groupKey: "10459124",
  partNumber: "10459124S",
  description: "FRONT BRAKE DISC FORD RANGER (11-) 302MM (V)",
  brand: "STARLINE",
  tier: "Aftermarket",
  costPence: 5704,
  surchargePence: null,
  rrpPence: null,
  availability: [],
  totalQty: null,
  fitment: [],
  quantityOfFit: 2,
  imageUrl: null,
  notes: [],
  buyable: true,
  ...over,
});

describe("normaliseBrand", () => {
  it("ignores punctuation and case so EICHER-PRM matches Eicher PRM", () => {
    expect(normaliseBrand("EICHER-PRM")).toBe(normaliseBrand("Eicher Prm"));
    expect(normaliseBrand(null)).toBe("");
  });
});

describe("sizeSignature", () => {
  it("pulls the measurements that actually distinguish two parts", () => {
    expect(sizeSignature("FRONT BRAKE DISC FORD RANGER (11-) 302MM (V)")).toBe("302");
    expect(sizeSignature("FRONT DISC 278MM")).toBe("278");
  });

  it("falls back to numeric fitment values when the text carries no size", () => {
    expect(
      sizeSignature("BRAKE DISC", [
        { label: "Fitting Position", value: "Front" },
        { label: "Outer diameter [mm]", value: "300" },
      ]),
    ).toBe("300");
  });

  it("is empty when there is nothing to go on", () => {
    expect(sizeSignature("BRAKE DISC")).toBe("");
  });
});

describe("buildComparisonRows", () => {
  it("gives every LKQ offer a row with an empty Alliance column", () => {
    // Today's reality: AAG is 403'd, so every row is LKQ-only.
    const rows = buildComparisonRows([offer(), offer({ partNumber: "104591249" })], []);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.lkq !== null && r.aag === null)).toBe(true);
    expect(rows[0].lkq?.partNumber).toBe("10459124S");
  });

  it("keeps each supplier's own part number in its own column", () => {
    const rows = buildComparisonRows(
      [offer({ brand: "PAGID", partNumber: "104591248", costPence: 7577 })],
      [
        offer({
          supplier: "aag",
          brand: "PAGID",
          partNumber: "AAG-88213",
          costPence: 7120,
          description: "BRAKE DISC FRONT VENTED 302MM",
        }),
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].lkq?.partNumber).toBe("104591248");
    expect(rows[0].aag?.partNumber).toBe("AAG-88213");
    expect(rows[0].cheapestSupplier).toBe("aag");
    expect(rows[0].cheapestPence).toBe(7120);
  });

  it("REFUSES to merge the same brand at a different size", () => {
    // The whole danger of matching on brand: a 302mm disc and a 278mm disc from
    // the same maker are different parts. Two rows, not one wrong comparison.
    const rows = buildComparisonRows(
      [offer({ brand: "PAGID", description: "FRONT DISC 302MM" })],
      [
        offer({
          supplier: "aag",
          brand: "PAGID",
          partNumber: "AAG-1",
          description: "FRONT DISC 278MM",
        }),
      ],
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].aag).toBeNull();
    expect(rows[1].lkq).toBeNull();
  });

  it("refuses to merge when the match is ambiguous", () => {
    // Two LKQ Pagid 302mm rows and one AAG Pagid 302mm: we cannot know which it
    // pairs with, so it gets its own row rather than an arbitrary one.
    const rows = buildComparisonRows(
      [
        offer({ brand: "PAGID", partNumber: "P1" }),
        offer({ brand: "PAGID", partNumber: "P2" }),
      ],
      [offer({ supplier: "aag", brand: "PAGID", partNumber: "AAG-1" })],
    );
    expect(rows).toHaveLength(3);
    expect(rows.filter((r) => r.aag !== null)).toHaveLength(1);
    expect(rows.find((r) => r.aag !== null)?.lkq).toBeNull();
  });

  it("an AAG-only part gets its own row, LKQ column empty", () => {
    const rows = buildComparisonRows(
      [],
      [offer({ supplier: "aag", brand: "TRW", partNumber: "AAG-9" })],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].lkq).toBeNull();
    expect(rows[0].aag?.partNumber).toBe("AAG-9");
  });

  it("never treats an unpriced part as the cheapest", () => {
    const rows = buildComparisonRows(
      [offer({ costPence: null, buyable: false })],
      [offer({ supplier: "aag", partNumber: "AAG-2", costPence: 9999 })],
    );
    // Same brand and size, so they merge; the priced side must win.
    expect(rows).toHaveLength(1);
    expect(rows[0].cheapestSupplier).toBe("aag");
    expect(rows[0].cheapestPence).toBe(9999);
  });

  it("leaves cheapest null when nothing is priced", () => {
    const rows = buildComparisonRows([offer({ costPence: null, buyable: false })], []);
    expect(rows[0].cheapestPence).toBeNull();
    expect(rows[0].cheapestSupplier).toBeNull();
  });
});

describe("sortRows", () => {
  const rows = buildComparisonRows(
    [
      offer({ partNumber: "A", brand: "ZED", costPence: 9000, description: "AAA 100MM" }),
      offer({ partNumber: "B", brand: "ALPHA", costPence: 1000, description: "ZZZ 200MM" }),
      offer({ partNumber: "C", brand: "MID", costPence: null, buyable: false, description: "MMM 300MM" }),
    ],
    [],
  );

  it("sinks unpriced rows to the bottom rather than sorting them as free", () => {
    expect(sortRows(rows, "price").map((r) => r.lkq?.partNumber)).toEqual(["B", "A", "C"]);
  });

  it("sorts by brand and by name", () => {
    expect(sortRows(rows, "brand").map((r) => r.brand)).toEqual(["ALPHA", "MID", "ZED"]);
    expect(sortRows(rows, "name")[0].name).toContain("AAA");
  });
});

describe("filterRows / brandsOf", () => {
  const rows = buildComparisonRows(
    [offer({ brand: "PAGID", partNumber: "P1" }), offer({ brand: "BREMBO", partNumber: "B1" })],
    [offer({ supplier: "aag", brand: "TRW", partNumber: "AAG-1", description: "DISC 999MM" })],
  );

  it("lists the brands present, sorted", () => {
    expect(brandsOf(rows)).toEqual(["BREMBO", "PAGID", "TRW"]);
  });

  it("filters by brand", () => {
    expect(filterRows(rows, { brand: "PAGID", supplier: "all", query: "" })).toHaveLength(1);
  });

  it("filters by which supplier actually carries the part", () => {
    expect(filterRows(rows, { brand: "all", supplier: "lkq", query: "" })).toHaveLength(2);
    expect(filterRows(rows, { brand: "all", supplier: "aag", query: "" })).toHaveLength(1);
  });

  it("searches part numbers from either supplier", () => {
    expect(filterRows(rows, { brand: "all", supplier: "all", query: "AAG-1" })).toHaveLength(1);
    expect(filterRows(rows, { brand: "all", supplier: "all", query: "P1" })).toHaveLength(1);
    expect(filterRows(rows, { brand: "all", supplier: "all", query: "nope" })).toHaveLength(0);
  });
});
