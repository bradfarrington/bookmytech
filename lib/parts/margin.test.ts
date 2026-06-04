import { describe, it, expect } from "vitest";
import { marginPence, marginPct, markupPct } from "./margin";

describe("marginPence", () => {
  it("is BMT price minus supplier cost", () => {
    expect(marginPence(1800, 3200)).toBe(1400);
  });
  it("never goes negative", () => {
    expect(marginPence(3200, 1800)).toBe(0);
  });
});

describe("marginPct (gross margin on sale price)", () => {
  it("computes margin as a % of the BMT price", () => {
    // (3200-1800)/3200 = 43.75%
    expect(marginPct(1800, 3200)).toBe(43.8);
  });
  it("is 0 when the price is 0", () => {
    expect(marginPct(1000, 0)).toBe(0);
  });
});

describe("markupPct (markup on cost)", () => {
  it("computes margin as a % of supplier cost", () => {
    // (3200-1800)/1800 = 77.8%
    expect(markupPct(1800, 3200)).toBe(77.8);
  });
  it("is 0 when the cost is 0", () => {
    expect(markupPct(0, 3200)).toBe(0);
  });
});
