import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { gasForAge, parseGrams, parseRefrigerantCharges, plateYear, quoteRefrigerant } from "./refrigerant";
import type { HpAdjustment } from "./types";

function fixture(carTypeId: number): HpAdjustment[] {
  const raw = JSON.parse(readFileSync(join(__dirname, "__fixtures__", `capacities-${carTypeId}.json`), "utf8"));
  return Array.isArray(raw) ? raw : [raw];
}

const PRICES = { R134a: 500, R1234yf: 1500 };

describe("parseRefrigerantCharges", () => {
  it("names each figure's gas from the heading before it", () => {
    expect(parseRefrigerantCharges(fixture(301000817))).toEqual([
      { gas: "R134a", grams: 500 },
      { gas: "R1234yf", grams: 460 },
    ]);
    expect(parseRefrigerantCharges(fixture(619114949))).toEqual([
      { gas: "R1234yf", grams: 570 },
      { gas: "R134a", grams: 630 },
    ]);
  });

  it("keeps both heat-pump variants, gas unnamed", () => {
    expect(parseRefrigerantCharges(fixture(619017105))).toEqual([
      { gas: null, grams: 660 },
      { gas: null, grams: 1020 },
    ]);
  });

  it("reads a lone figure and nothing from compressor oil", () => {
    expect(parseRefrigerantCharges(fixture(106000261))).toEqual([{ gas: null, grams: 400 }]);
  });

  it("is empty with no data", () => {
    expect(parseRefrigerantCharges([])).toEqual([]);
    expect(parseRefrigerantCharges(null)).toEqual([]);
  });
});

describe("parseGrams", () => {
  it("reads grams and kilograms, ignoring the tolerance", () => {
    expect(parseGrams("500 ± 15", "(g)")).toBe(500);
    expect(parseGrams("0,46", "kg")).toBe(460);
    expect(parseGrams("110", "(ml)")).toBeNull();
    expect(parseGrams("5", "(g)")).toBeNull();
  });
});

describe("plateYear / gasForAge", () => {
  it("reads the age identifier", () => {
    expect(plateYear("BF23OTH")).toBe(2023);
    expect(plateYear("FN60 KYP")).toBe(2010);
    expect(plateYear("AB66CDE")).toBe(2016);
    expect(plateYear("A123BCD")).toBeNull();
  });

  it("is R1234yf from 2017, R134a to 2012, and unsettled between", () => {
    expect(gasForAge("AB17CDE")).toBe("R1234yf");
    expect(gasForAge("AB67CDE")).toBe("R1234yf");
    expect(gasForAge("AB12CDE")).toBe("R134a");
    expect(gasForAge("AB15CDE")).toBeNull();
    expect(gasForAge("1 ABC")).toBeNull();
  });
});

describe("quoteRefrigerant", () => {
  const both = [
    { gas: "R134a" as const, grams: 500 },
    { gas: "R1234yf" as const, grams: 460 },
  ];

  it("charges the gas the car's age says, by HaynesPro's weight", () => {
    expect(quoteRefrigerant(both, PRICES, "AB19CDE")).toEqual({ gas: "R1234yf", grams: 460, pencePer100g: 1500, pence: 6900 });
    expect(quoteRefrigerant(both, PRICES, "AB10CDE")).toEqual({ gas: "R134a", grams: 500, pencePer100g: 500, pence: 2500 });
  });

  it("charges the dearer gas when the age doesn't settle it", () => {
    expect(quoteRefrigerant(both, PRICES, "AB15CDE")?.gas).toBe("R1234yf");
    expect(quoteRefrigerant(both, { R134a: 2000, R1234yf: 1500 }, "AB15CDE")?.gas).toBe("R134a");
  });

  it("uses the one gas HaynesPro names, whatever the plate says", () => {
    expect(quoteRefrigerant([{ gas: "R134a", grams: 550 }], PRICES, "AB19CDE")).toMatchObject({ gas: "R134a", grams: 550 });
  });

  it("takes the largest figure (heat pump) for an unnamed gas", () => {
    const ev = [
      { gas: null, grams: 660 },
      { gas: null, grams: 1020 },
    ];
    expect(quoteRefrigerant(ev, PRICES, "AB21CDE")).toEqual({ gas: "R1234yf", grams: 1020, pencePer100g: 1500, pence: 15300 });
  });

  it("goes to a quote with no figure, or no price for the gas", () => {
    expect(quoteRefrigerant([], PRICES, "AB19CDE")).toBeNull();
    expect(quoteRefrigerant(both, { R134a: 500, R1234yf: null }, "AB19CDE")).toBeNull();
    expect(quoteRefrigerant(both, { R134a: 500, R1234yf: null }, "AB15CDE")).toBeNull();
  });
});
