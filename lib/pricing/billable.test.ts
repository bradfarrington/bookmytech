import { describe, expect, it } from "vitest";
import { billableHours } from "./billable";

// Owner decision 2026-07-09: bill in whole hours, always rounding up, min 1h.
describe("billableHours", () => {
  it("rounds sub-hour times up to the 1-hour minimum", () => {
    expect(billableHours(0.2)).toBe(1);
    expect(billableHours(0.7)).toBe(1);
  });

  it("keeps exact whole hours", () => {
    expect(billableHours(1)).toBe(1);
    expect(billableHours(2)).toBe(2);
    expect(billableHours(5)).toBe(5);
  });

  it("rounds any fraction up to the next whole hour", () => {
    expect(billableHours(1.2)).toBe(2);
    expect(billableHours(1.5)).toBe(2);
    expect(billableHours(1.6)).toBe(2);
    expect(billableHours(2.3)).toBe(3);
    expect(billableHours(4.8)).toBe(5);
  });

  it("is immune to float noise on whole hours", () => {
    expect(billableHours(1.0000000004)).toBe(1);
    expect(billableHours(2.9999999999)).toBe(3);
  });

  it("returns null for missing/zero/invalid input", () => {
    expect(billableHours(null)).toBeNull();
    expect(billableHours(undefined)).toBeNull();
    expect(billableHours(0)).toBeNull();
    expect(billableHours(-1)).toBeNull();
    expect(billableHours(Number.NaN)).toBeNull();
  });
});
