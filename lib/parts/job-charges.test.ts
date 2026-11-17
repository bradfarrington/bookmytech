import { describe, expect, it } from "vitest";

import { genartIdsOf } from "@/lib/haynespro/genarts";
import type { AagPartOffers } from "./aag-part-prices";
import { alternativePairs, chargedGroups, correctedGroups, isConsumableGroup, isReplacingJob } from "./job-charges";
import { partGroupsOnNodes } from "./part-groups";
import { priceJobParts, type PartsJob } from "./quote-parts";
import type { SupplierOffer } from "./supplier-offer";

const BATTERY = { id: 2, description: "Starter battery" };
const BRAKE_FLUID = { id: 3357, description: "Brake fluid" };
const ANTIFREEZE = { id: 3356, description: "Antifreeze" };
const REFRIGERANT = { id: 1442, description: "Refrigerant, air conditioning" };
const DISC = { id: 82, description: "Brake disc" };

describe("isReplacingJob", () => {
  it("is true for jobs that fit a part", () => {
    for (const d of ["Renew the battery", "Replace the wiper blades", "Fit a tow bar", "Retrofit the parking sensors", "Repair the power steering hose"]) {
      expect(isReplacingJob(d)).toBe(true);
    }
  });

  it("is false for jobs that only check, charge, clean, adjust or remove and refit", () => {
    for (const d of [
      "Check the battery connections and fluid level",
      "Charge the battery using a charging station",
      "Check the starter motor signal",
      "Clean the rear brake discs*",
      "Remove/refit both rear brake discs",
      "Bleed the brake system",
      "Check/top up the coolant level",
      "Drain/refill the cooling system",
      "Difficult alternator removal *",
      "Tighten the front left drive shaft locking nut",
      "Identify the cause of the engine electronics malfunction",
    ]) {
      expect(isReplacingJob(d)).toBe(false);
    }
  });

  it("keeps charging everything on a job with no wording, as before", () => {
    expect(isReplacingJob(null)).toBe(true);
    expect(isReplacingJob("")).toBe(true);
  });
});

describe("isConsumableGroup", () => {
  it("knows oils, fluids, antifreeze and refrigerant", () => {
    for (const l of ["Antifreeze", "Engine oil", "Brake fluid", "Automatic transmission fluid", "Axle gear oil", "Refrigerant, air conditioning"]) {
      expect(isConsumableGroup(l)).toBe(true);
    }
  });

  it("knows the one-use fittings a refitted part needs", () => {
    for (const l of ["Gasket, cylinder head cover", "Gasket, cylinder head", "Cylinder head bolt set", "Seal ring, oil pressure switch", "Battery acid"]) {
      expect(isConsumableGroup(l)).toBe(true);
    }
    expect(isConsumableGroup("Sealing cap")).toBe(false);
  });

  it("never takes a part that merely mentions a fluid", () => {
    for (const l of ["Oil cooler, engine oil", "Pressure sensor, coolant", "Fluid reservoir, brake fluid", "Equalising reservoir, hydraulic oil (power steering)", "Oil filter", "Starter battery"]) {
      expect(isConsumableGroup(l)).toBe(false);
    }
  });
});

describe("chargedGroups (the October examples)", () => {
  it("battery checks and charges charge no battery", () => {
    expect(chargedGroups("Check the battery connections and fluid level", [BATTERY])).toEqual([]);
    expect(chargedGroups("Charge the battery", [BATTERY])).toEqual([]);
  });

  it("'Renew the battery' still charges the battery", () => {
    expect(chargedGroups("Renew the battery", [BATTERY])).toEqual([BATTERY]);
  });

  it("top-ups and bleeds keep charging their fluid (a full fill, as before)", () => {
    expect(chargedGroups("Check/top up the brake fluid level", [BRAKE_FLUID])).toEqual([BRAKE_FLUID]);
    expect(chargedGroups("Check/top up the coolant level", [ANTIFREEZE])).toEqual([ANTIFREEZE]);
    expect(chargedGroups("Bleed the brake system", [BRAKE_FLUID])).toEqual([BRAKE_FLUID]);
  });

  it("removing an air-con line still charges the refrigerant it loses", () => {
    expect(chargedGroups("Remove/refit the line between the compressor and the evaporator", [REFRIGERANT])).toEqual([REFRIGERANT]);
  });

  it("refitting a cylinder head charges its gasket and bolts, not a new head", () => {
    const groups = [
      { id: 977, description: "Cylinder head" },
      { id: 1, description: "Gasket, cylinder head cover" },
      { id: 2, description: "Cylinder head bolt set" },
      ANTIFREEZE,
    ];
    expect(chargedGroups("Remove/refit the cylinder head", groups).map((g) => g.id)).toEqual([1, 2, 3356]);
  });

  it("cleaning the discs charges no discs", () => {
    expect(chargedGroups("Clean the rear brake discs*", [DISC])).toEqual([]);
  });
});

describe("the rule reaches every reader of a job's part groups", () => {
  const check = { id: "n1", description: "Check the battery connections and fluid level", genarts: [BATTERY] };
  const renew = { id: "n2", description: "Renew the battery", genarts: [BATTERY] };

  it("genartIdsOf: a check job has no part groups, so the list shows a plain price", () => {
    expect(genartIdsOf(check)).toBeUndefined();
    expect(genartIdsOf(renew)).toEqual([2]);
  });

  it("partGroupsOnNodes: a check job asks NAPA for nothing", () => {
    expect(partGroupsOnNodes([check])).toEqual([]);
    expect(partGroupsOnNodes([renew]).map((g) => g.genartId)).toEqual([2]);
  });
});

describe("alternativePairs", () => {
  it("pairs a part with its kit", () => {
    expect(
      alternativePairs([
        { genartId: 1, label: "Bellow, drive shaft" },
        { genartId: 2, label: "Bellow kit, drive shaft" },
      ]),
    ).toEqual([{ single: 1, kit: 2 }]);
    expect(
      alternativePairs([
        { genartId: 10, label: "Wheel bearing" },
        { genartId: 11, label: "Wheel bearing kit" },
      ]),
    ).toEqual([{ single: 10, kit: 11 }]);
  });

  it("pairs one part type listed twice under two ids", () => {
    expect(
      alternativePairs([
        { genartId: 71, label: "Brake fluid" },
        { genartId: 3357, label: "Brake fluid" },
      ]),
    ).toEqual([{ single: 71, kit: 3357 }]);
  });

  it("leaves unrelated groups alone", () => {
    expect(
      alternativePairs([
        { genartId: 82, label: "Brake disc" },
        { genartId: 402, label: "Brake pad set" },
      ]),
    ).toEqual([]);
  });
});

function offer(partNumber: string, pence: number): SupplierOffer {
  return {
    supplier: "aag",
    partNumber,
    description: null,
    brand: "NAPA",
    tier: "Best",
    costPence: pence,
    surchargePence: null,
    availability: [],
    totalQty: null,
    fitment: [],
    quantityOfFit: 1,
    position: null,
    imageUrl: null,
    notes: [],
    buyable: true,
  };
}

const ok = (offers: SupplierOffer[]): AagPartOffers => ({ state: "ok", offers, pricedAt: "2026-11-17T12:00:00Z", lastKnown: false });

describe("priceJobParts charges one of a part and its kit", () => {
  const job: PartsJob = {
    nodeId: "wb",
    description: "Renew the front left wheel bearing",
    groups: [
      { genartId: 10, label: "Wheel bearing" },
      { genartId: 11, label: "Wheel bearing kit" },
    ],
  };

  it("charges the kit when NAPA prices it", () => {
    const result = priceJobParts({ jobs: [job], offers: new Map([[10, ok([offer("WB", 3000)])], [11, ok([offer("WBK", 4500)])]]) });
    expect(result.ok && result.parts.map((p) => p.genartId)).toEqual([11]);
  });

  it("charges the single part when the kit has no price", () => {
    const result = priceJobParts({ jobs: [job], offers: new Map([[10, ok([offer("WB", 3000)])], [11, { state: "empty", pricedAt: "2026-11-17T12:00:00Z" }]]) });
    expect(result.ok && result.parts.map((p) => p.genartId)).toEqual([10]);
  });
});

describe("correctedGroups: HaynesPro's known part-type mistakes (Task 77)", () => {
  const EGT = { id: 3938, description: "Sensor, exhaust gas temperature" };
  const O2 = { id: 3922, description: "Oxygen sensor" };

  it("asks for an oxygen sensor, not an exhaust gas temperature sensor, on oxygen sensor jobs", () => {
    for (const job of [
      "Renew the upstream oxygen sensor",
      "Renew the downstream oxygen sensor",
      "Renew the catalytic converter downstream oxygen sensor",
    ]) {
      expect(chargedGroups(job, [EGT])).toEqual([O2]);
    }
  });

  it("lists the oxygen sensor once when HaynesPro gives both", () => {
    expect(chargedGroups("Renew the front oxygen sensor", [O2, EGT])).toEqual([O2]);
  });

  it("leaves exhaust gas temperature sensor jobs alone", () => {
    expect(chargedGroups("Renew the exhaust gas temperature sensor", [EGT])).toEqual([EGT]);
  });

  it("keeps other fields on a corrected group", () => {
    expect(correctedGroups("Renew the upstream oxygen sensor", [{ ...EGT, mandatory: true }])).toEqual([{ ...O2, mandatory: true }]);
  });
});
