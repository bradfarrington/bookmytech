import { describe, it, expect } from "vitest";
import {
  computePrice,
  resolveArea,
  normalisePostcode,
  DEFAULT_TAKE_RATE,
  type AreaRow,
} from "./calculate";

describe("computePrice", () => {
  it("derives the labour base from duration × hourly rate", () => {
    const r = computePrice({
      durationHours: 2,
      hourlyRatePence: 6000, // £60/hr
      commissionRate: 0.15,
    });
    expect(r.basePence).toBe(12000); // 2h × £60
    expect(r.durationHours).toBe(2);
    expect(r.hourlyRatePence).toBe(6000);
    expect(r.partsPence).toBe(0);
    expect(r.totalPence).toBe(12000);
  });

  it("handles fractional durations, rounding to the nearest pence", () => {
    const r = computePrice({
      durationHours: 1.5,
      hourlyRatePence: 6000,
      commissionRate: 0.15,
    });
    expect(r.basePence).toBe(9000); // 1.5h × £60
  });

  it("adds parts on top of the labour base", () => {
    const r = computePrice({
      durationHours: 3,
      hourlyRatePence: 6000,
      partsPence: 4500,
      commissionRate: 0.15,
    });
    expect(r.basePence).toBe(18000); // 3h × £60
    expect(r.totalPence).toBe(22500); // 18000 + 4500
  });

  it("charges commission on the whole total (base + parts), taken out of it", () => {
    const r = computePrice({
      durationHours: 3,
      hourlyRatePence: 6000,
      partsPence: 4500,
      commissionRate: 0.15,
    });
    expect(r.totalPence).toBe(22500);
    expect(r.platformFeePence).toBe(3375); // round(22500 × 0.15)
    expect(r.mechanicPayoutPence).toBe(19125); // 22500 − 3375
    // Fee + payout always reconcile to the total exactly (integer pence).
    expect(r.platformFeePence + r.mechanicPayoutPence).toBe(r.totalPence);
  });

  it("uses the override price as the base instead of duration × rate", () => {
    const r = computePrice({
      durationHours: 3, // would give 18000, but override wins
      hourlyRatePence: 6000,
      overridePricePence: 20000,
      partsPence: 1000,
      commissionRate: 0.2,
    });
    expect(r.basePence).toBe(20000);
    expect(r.totalPence).toBe(21000);
    expect(r.platformFeePence).toBe(4200); // round(21000 × 0.2)
    expect(r.mechanicPayoutPence).toBe(16800);
  });

  it("treats an override of 0 as a valid base (free labour)", () => {
    const r = computePrice({
      durationHours: 3,
      hourlyRatePence: 6000,
      overridePricePence: 0,
      partsPence: 5000,
      commissionRate: 0.15,
    });
    expect(r.basePence).toBe(0);
    expect(r.totalPence).toBe(5000);
  });

  it("falls back to the default take rate for a non-finite commission", () => {
    const r = computePrice({
      durationHours: 2,
      hourlyRatePence: 5000,
      commissionRate: Number.NaN,
    });
    expect(r.commissionRate).toBe(DEFAULT_TAKE_RATE);
    expect(r.platformFeePence).toBe(Math.round(10000 * DEFAULT_TAKE_RATE));
  });

  it("clamps negative/garbage inputs to zero", () => {
    const r = computePrice({
      durationHours: -1,
      hourlyRatePence: -6000,
      partsPence: -100,
      commissionRate: 0.15,
    });
    expect(r.basePence).toBe(0);
    expect(r.partsPence).toBe(0);
    expect(r.totalPence).toBe(0);
    expect(r.mechanicPayoutPence).toBe(0);
  });
});

describe("normalisePostcode", () => {
  it("uppercases and strips all whitespace", () => {
    expect(normalisePostcode("sw1a 1aa")).toBe("SW1A1AA");
    expect(normalisePostcode("  ec1 ")).toBe("EC1");
  });
});

describe("resolveArea", () => {
  const areas: AreaRow[] = [
    { id: "z12", name: "London Z1-Z2", postcode_prefixes: ["EC", "WC", "SW1", "SE1"], labour_multiplier: 1.15 },
    { id: "z36", name: "London Z3-Z6", postcode_prefixes: ["SW", "SE", "N", "E"], labour_multiplier: 1.05 },
    { id: "man", name: "Manchester", postcode_prefixes: ["M"], labour_multiplier: 1.0 },
    { id: "def", name: "Default", postcode_prefixes: [], labour_multiplier: 1.0 },
  ];

  it("matches the longest prefix (SW1 beats SW)", () => {
    expect(resolveArea("SW1A 1AA", areas)?.id).toBe("z12");
  });

  it("matches the broad prefix when no specific one applies", () => {
    expect(resolveArea("SW9 8AB", areas)?.id).toBe("z36"); // SW, not SW1
  });

  it("matches a single-letter prefix", () => {
    expect(resolveArea("M1 1AE", areas)?.id).toBe("man");
  });

  it("is whitespace/case insensitive", () => {
    expect(resolveArea("ec1a1bb", areas)?.id).toBe("z12");
  });

  it("falls back to the Default area when nothing matches", () => {
    expect(resolveArea("ZZ1 1ZZ", areas)?.id).toBe("def");
  });

  it("falls back to Default for an empty postcode", () => {
    expect(resolveArea("", areas)?.id).toBe("def");
  });

  it("returns null when no area matches and there is no Default", () => {
    const noDefault = areas.filter((a) => a.name !== "Default");
    expect(resolveArea("ZZ1 1ZZ", noDefault)).toBeNull();
  });
});
