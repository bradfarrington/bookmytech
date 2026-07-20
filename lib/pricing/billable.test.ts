import { describe, expect, it } from "vitest";
import { billableHours } from "./billable";

// Owner decision 2026-07-20: bill the exact OEM book time, min 1h.
describe("billableHours", () => {
  it("lifts sub-hour times to the 1-hour minimum", () => {
    expect(billableHours(0.2)).toBe(1);
    expect(billableHours(0.7)).toBe(1);
  });

  it("keeps whole hours exact", () => {
    expect(billableHours(1)).toBe(1);
    expect(billableHours(2)).toBe(2);
    expect(billableHours(5)).toBe(5);
  });

  it("keeps fractional hours exact above the minimum", () => {
    expect(billableHours(1.2)).toBe(1.2);
    expect(billableHours(1.5)).toBe(1.5);
    expect(billableHours(1.6)).toBe(1.6);
    expect(billableHours(2.3)).toBe(2.3);
    expect(billableHours(4.8)).toBe(4.8);
  });

  it("strips float noise to two decimal places", () => {
    expect(billableHours(1.0000000004)).toBe(1);
    expect(billableHours(2.9999999999)).toBe(3);
    expect(billableHours(120 / 100)).toBe(1.2);
  });

  it("returns null for missing/zero/invalid input", () => {
    expect(billableHours(null)).toBeNull();
    expect(billableHours(undefined)).toBeNull();
    expect(billableHours(0)).toBeNull();
    expect(billableHours(-1)).toBeNull();
    expect(billableHours(Number.NaN)).toBeNull();
  });
});
