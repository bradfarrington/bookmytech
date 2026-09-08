import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { HpAdjustment } from "./types";
import { isElectricOnly, parseEngineOilCapacity, parseLitres } from "./oil-capacity";

// Real getLubricantCapacitiesV4 payloads captured with scripts/probe-oil-capacity.mjs.
function fixture(carTypeId: number): HpAdjustment[] {
  const raw = JSON.parse(readFileSync(join(__dirname, "__fixtures__", `capacities-${carTypeId}.json`), "utf8"));
  return Array.isArray(raw) ? raw : [raw];
}

describe("parseEngineOilCapacity on live payloads", () => {
  it("VW Golf VII 1.0 TSI (petrol) — 4.0 l with filter", () => {
    expect(parseEngineOilCapacity(fixture(317000222))).toEqual({
      litres: 4,
      label: "Engine sump, including filter",
      ambiguous: false,
    });
  });

  it("SEAT Leon 2.0 TDI (diesel) — 4.6 l", () => {
    expect(parseEngineOilCapacity(fixture(301000817))?.litres).toBe(4.6);
  });

  it("Ford Ranger 3.0 TDCI — two sumps listed; takes the larger and says so", () => {
    const oil = parseEngineOilCapacity(fixture(619114949));
    expect(oil?.litres).toBe(8.9);
    expect(oil?.ambiguous).toBe(true);
    expect(oil?.label).toBe("Engine sump, including filter · Red dipstick O-ring");
  });

  it("Toyota Prius (hybrid) — has an engine, so has engine oil", () => {
    expect(parseEngineOilCapacity(fixture(57850))?.litres).toBe(3.7);
  });

  it("Nissan Leaf (EV) — reduction-gearbox oil is NOT engine oil", () => {
    expect(parseEngineOilCapacity(fixture(106000261))).toBeNull();
  });

  it("Tesla Model 3 (EV) — drive-unit oil is NOT engine oil", () => {
    expect(parseEngineOilCapacity(fixture(619017105))).toBeNull();
  });
});

describe("parseEngineOilCapacity on synthetic shapes", () => {
  const row = (name: string, value: string | null, unit: string | null, extra: Partial<HpAdjustment> = {}): HpAdjustment => ({
    name,
    value,
    unit,
    remark: null,
    subAdjustments: null,
    ...extra,
  });

  it("prefers the with-filter figure over a without-filter one, whatever the order", () => {
    const rows = [
      row("Engine oil, without filter", "4.3", "(l)"),
      row("Engine oil, with filter change", "4.6", "(l)"),
    ];
    expect(parseEngineOilCapacity(rows)?.litres).toBe(4.6);
    expect(parseEngineOilCapacity([...rows].reverse())?.litres).toBe(4.6);
  });

  it("finds a nested row and ignores heading-only rows", () => {
    const rows: HpAdjustment[] = [
      row("Capacities", null, null, {
        subAdjustments: [row("Engine", null, null), row("Engine sump, including filter", null, null, { remark: "Caution" }), row("Engine sump, including filter", "5,2", "(l)")],
      }),
    ];
    expect(parseEngineOilCapacity(rows)?.litres).toBe(5.2);
  });

  it("returns null when nothing engine-oil-like has a value", () => {
    expect(parseEngineOilCapacity([row("Gearbox refill", "2.3", "(l)"), row("Cooling system", "8.0", "(l)")])).toBeNull();
    expect(parseEngineOilCapacity(null)).toBeNull();
    expect(parseEngineOilCapacity([])).toBeNull();
  });
});

describe("parseLitres", () => {
  it("reads decimals, commas, ranges (larger figure), approximations and comparators", () => {
    expect(parseLitres("4.0", "(l)")).toBe(4);
    expect(parseLitres("4,3", "l")).toBe(4.3);
    expect(parseLitres("8.5 - 9.4", "(l)")).toBe(9.4);
    expect(parseLitres("approx. 4.3", "(l)")).toBe(4.3);
    expect(parseLitres("> 4.0", "(l)")).toBe(4);
  });

  it("converts millilitres and US quarts, refuses other units", () => {
    expect(parseLitres("4500", "(ml)")).toBe(4.5);
    expect(parseLitres("1.06", "(qt)")).toBe(1);
    expect(parseLitres("500", "(g)")).toBeNull();
    expect(parseLitres("4.0", "(bar)")).toBeNull();
  });

  it("rejects the implausible", () => {
    expect(parseLitres("0.1", "(l)")).toBeNull();
    expect(parseLitres("45", "(l)")).toBeNull();
    expect(parseLitres("", "(l)")).toBeNull();
    expect(parseLitres(null, "(l)")).toBeNull();
    expect(parseLitres("n/a", "(l)")).toBeNull();
  });
});

describe("isElectricOnly", () => {
  it("recognises HaynesPro's and DVLA's spellings and leaves hybrids alone", () => {
    expect(isElectricOnly(["ELECTRICAL"])).toBe(true);
    expect(isElectricOnly("ELECTRICITY")).toBe(true);
    expect(isElectricOnly("Electric")).toBe(true);
    expect(isElectricOnly(["PETROL"])).toBe(false);
    expect(isElectricOnly(["PETROL", "ELECTRIC"])).toBe(false);
    expect(isElectricOnly("HYBRID ELECTRIC")).toBe(false);
    expect(isElectricOnly(null)).toBe(false);
    expect(isElectricOnly([])).toBe(false);
  });
});
