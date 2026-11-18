import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseFluidCapacities } from "./fluid-capacity";
import type { HpAdjustment } from "./types";

function fixture(carTypeId: number): HpAdjustment[] {
  const raw = JSON.parse(readFileSync(join(__dirname, "__fixtures__", `capacities-${carTypeId}.json`), "utf8"));
  return Array.isArray(raw) ? raw : [raw];
}

describe("parseFluidCapacities", () => {
  it("reads the engine's cooling system and the brake system", () => {
    expect(parseFluidCapacities(fixture(57850))).toEqual({ coolantLitres: 4.9, brakeFluidLitres: 1 });
  });

  it("takes the largest brake figure when it varies by drive side or gearbox", () => {
    expect(parseFluidCapacities(fixture(301000817))).toEqual({ coolantLitres: 8, brakeFluidLitres: 2.2 });
  });

  it("never takes an EV's motor or battery cooling as the engine's", () => {
    expect(parseFluidCapacities(fixture(106000261)).coolantLitres).toBeNull();
    expect(parseFluidCapacities(fixture(619017105)).coolantLitres).toBeNull();
  });

  it("is empty with no data", () => {
    expect(parseFluidCapacities([])).toEqual({ coolantLitres: null, brakeFluidLitres: null });
  });
});
