import { describe, expect, it } from "vitest";
import { parseProcessRepairTasks } from "./combine";

// Fixtures are the live processRepairTasksV4 replies captured 2026-09-04 for a
// VW Golf VII 1.0 TSI (repairtimeTypeId 115566), trimmed to the fields we read.

const DISCS = "1M01822000WV0";
const PADS = "1M01510000WV0";
const REAR_PADS = "1M01534000WV0";

const discsAndPads = {
  status: { statusCode: 0, confirmationLink: null },
  totalRepairTime: 110,
  repairPriceWithoutVat: 6600,
  totalRepairPrice: 6613,
  basketItems: [
    {
      id: DISCS,
      description: "Renew both front brake discs",
      calculatedTime: 110,
      priceWithoutVat: 6600,
      jobType: "MECHANICAL",
      repairtimesInfo: { includedList: [{ awNumber: "1M01530000N", description: "Remove/refit the front left brake pads", value: 25 }] },
    },
    { id: PADS, description: "Renew the front brake pads", calculatedTime: 0, priceWithoutVat: 0, jobType: "MECHANICAL" },
  ],
};

const frontAndRear = {
  status: { statusCode: 0 },
  totalRepairTime: 160,
  basketItems: [
    { id: PADS, description: "Renew the front brake pads", calculatedTime: 80, jobType: "MECHANICAL" },
    { id: REAR_PADS, description: "Renew the rear brake pads", calculatedTime: 80, jobType: "MECHANICAL" },
  ],
};

describe("parseProcessRepairTasks", () => {
  it("reads the overlap-removed times: discs absorb the pads", () => {
    const parsed = parseProcessRepairTasks(discsAndPads, [DISCS, PADS]);
    expect(parsed).toEqual({
      totalRepairTime: 110,
      items: [
        { id: DISCS, description: "Renew both front brake discs", calculatedTime: 110, jobType: "MECHANICAL" },
        { id: PADS, description: "Renew the front brake pads", calculatedTime: 0, jobType: "MECHANICAL" },
      ],
    });
  });

  it("reads a plain-sum basket", () => {
    const parsed = parseProcessRepairTasks(frontAndRear, [PADS, REAR_PADS]);
    expect(parsed?.totalRepairTime).toBe(160);
    expect(parsed?.items.map((i) => i.calculatedTime)).toEqual([80, 80]);
  });

  it("is indifferent to request order and tolerates extra basket items", () => {
    expect(parseProcessRepairTasks(discsAndPads, [PADS, DISCS])?.totalRepairTime).toBe(110);
    expect(parseProcessRepairTasks(discsAndPads, [PADS])?.items).toHaveLength(2);
  });

  it("returns null when a requested id is missing from the basket", () => {
    expect(parseProcessRepairTasks(discsAndPads, [DISCS, PADS, REAR_PADS])).toBeNull();
  });

  it("returns null on a non-zero status", () => {
    expect(
      parseProcessRepairTasks({ ...discsAndPads, status: { statusCode: 6 } }, [DISCS, PADS]),
    ).toBeNull();
  });

  it("returns null on a duplicated basket id", () => {
    const dup = { ...frontAndRear, basketItems: [frontAndRear.basketItems[0], frontAndRear.basketItems[0]] };
    expect(parseProcessRepairTasks(dup, [PADS])).toBeNull();
  });

  it("returns null on a malformed envelope", () => {
    expect(parseProcessRepairTasks(null, [PADS])).toBeNull();
    expect(parseProcessRepairTasks("oops", [PADS])).toBeNull();
    expect(parseProcessRepairTasks([discsAndPads], [DISCS, PADS])).toBeNull();
    expect(parseProcessRepairTasks({ ...discsAndPads, basketItems: "x" }, [DISCS, PADS])).toBeNull();
    expect(parseProcessRepairTasks({ ...discsAndPads, basketItems: [{ description: "no id" }] }, [DISCS])).toBeNull();
  });

  it("returns null on bad times", () => {
    expect(parseProcessRepairTasks({ ...discsAndPads, totalRepairTime: 0 }, [DISCS, PADS])).toBeNull();
    expect(parseProcessRepairTasks({ ...discsAndPads, totalRepairTime: "110" }, [DISCS, PADS])).toBeNull();
    const negative = {
      ...frontAndRear,
      basketItems: [{ ...frontAndRear.basketItems[0], calculatedTime: -5 }, frontAndRear.basketItems[1]],
    };
    expect(parseProcessRepairTasks(negative, [PADS, REAR_PADS])).toBeNull();
    const fractional = {
      ...frontAndRear,
      basketItems: [{ ...frontAndRear.basketItems[0], calculatedTime: 80.5 }, frontAndRear.basketItems[1]],
    };
    expect(parseProcessRepairTasks(fractional, [PADS, REAR_PADS])).toBeNull();
  });
});
