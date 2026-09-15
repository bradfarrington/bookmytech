import { describe, expect, it } from "vitest";

import {
  bookVehicleHref,
  formatDvlaDate,
  lastCompletedByRegistration,
  motAlertTitle,
  motStat,
  taxStat,
  timeAgo,
  titleCaseDvla,
  vehicleCaption,
  vehicleTitle,
} from "./display";

const NOW = new Date("2026-09-15T09:00:00.000Z");

const vehicle = {
  nickname: null as string | null,
  make: "FORD",
  model: "FOCUS",
  colour: "GREY",
  yearOfManufacture: 2019,
  displayRegistration: "AB12 CDE",
};

describe("titleCaseDvla", () => {
  it("title-cases DVLA's capitals", () => {
    expect(titleCaseDvla("LAND ROVER")).toBe("Land Rover");
    expect(titleCaseDvla("MERCEDES-BENZ")).toBe("Mercedes-Benz");
    expect(titleCaseDvla("GREY")).toBe("Grey");
  });

  it("keeps acronyms and model codes", () => {
    expect(titleCaseDvla("BMW")).toBe("BMW");
    expect(titleCaseDvla("3 SERIES")).toBe("3 Series");
    expect(titleCaseDvla("GOLF GTI")).toBe("Golf GTI");
    expect(titleCaseDvla("A3")).toBe("A3");
  });

  it("leaves mixed case alone and has nothing for nothing", () => {
    expect(titleCaseDvla("Focus")).toBe("Focus");
    expect(titleCaseDvla("  ")).toBeNull();
    expect(titleCaseDvla(null)).toBeNull();
  });
});

describe("vehicle naming", () => {
  it("uses the make and model as the title without a nickname", () => {
    expect(vehicleTitle(vehicle)).toBe("Ford Focus");
    expect(vehicleCaption(vehicle)).toBe("Grey · 2019");
  });

  it("moves the make and model into the caption under a nickname", () => {
    const named = { ...vehicle, nickname: "Weekend car" };
    expect(vehicleTitle(named)).toBe("Weekend car");
    expect(vehicleCaption(named)).toBe("Ford Focus · Grey · 2019");
  });

  it("falls back to the plate", () => {
    const bare = { ...vehicle, make: null, model: null, colour: null, yearOfManufacture: null };
    expect(vehicleTitle(bare)).toBe("AB12 CDE");
    expect(vehicleCaption(bare)).toBeNull();
  });
});

describe("DVLA dates and statuses", () => {
  it("formats a DVLA date", () => {
    expect(formatDvlaDate("2026-12-01")).toBe("1 Dec 2026");
    expect(formatDvlaDate("soon")).toBeNull();
    expect(formatDvlaDate(null)).toBeNull();
  });

  it("colours the MOT by how soon it runs out", () => {
    expect(motStat("2027-03-01", NOW)).toEqual({ value: "1 Mar 2027", tone: "good" });
    expect(motStat("2026-10-01", NOW).tone).toBe("warn");
    expect(motStat("2026-09-01", NOW).tone).toBe("bad");
    expect(motStat(null, NOW)).toEqual({ value: "Not set", tone: "unset" });
  });

  it("words the MOT warning", () => {
    expect(motAlertTitle(null)).toBeNull();
    expect(motAlertTitle({ kind: "expired", days: -3 })).toBe("MOT expired");
    expect(motAlertTitle({ kind: "due_soon", days: 21 })).toBe("MOT due in 21 days");
    expect(motAlertTitle({ kind: "due_soon", days: 1 })).toBe("MOT due in 1 day");
    expect(motAlertTitle({ kind: "due_soon", days: 0 })).toBe("MOT due today");
  });

  it("reads DVLA's tax statuses, negatives first", () => {
    expect(taxStat("Taxed")).toEqual({ value: "Taxed", tone: "good" });
    expect(taxStat("Untaxed")).toEqual({ value: "Untaxed", tone: "bad" });
    expect(taxStat("Not Taxed for on Road Use")).toEqual({ value: "Untaxed", tone: "bad" });
    expect(taxStat("SORN")).toEqual({ value: "SORN", tone: "bad" });
    expect(taxStat(null)).toEqual({ value: "Not set", tone: "unset" });
  });
});

describe("timeAgo", () => {
  it("counts London calendar days", () => {
    expect(timeAgo("2026-09-15T06:00:00.000Z", NOW)).toBe("Today");
    // 23:30 on the 14th in London.
    expect(timeAgo("2026-09-14T22:30:00.000Z", NOW)).toBe("Yesterday");
    expect(timeAgo("2026-09-10T12:00:00.000Z", NOW)).toBe("5 days ago");
    expect(timeAgo("2026-08-20T12:00:00.000Z", NOW)).toBe("3 weeks ago");
    expect(timeAgo("2026-03-15T12:00:00.000Z", NOW)).toBe("6 months ago");
    expect(timeAgo("2024-06-01T12:00:00.000Z", NOW)).toBe("2 years ago");
    expect(timeAgo(null, NOW)).toBeNull();
    expect(timeAgo("not a date", NOW)).toBeNull();
  });
});

describe("lastCompletedByRegistration", () => {
  it("keeps each plate's latest completed booking, whatever its spacing", () => {
    const latest = lastCompletedByRegistration([
      { vehicleReg: "AB12 CDE", status: "completed", completedAt: "2026-01-10T10:00:00.000Z", scheduledAt: null },
      { vehicleReg: "ab12cde", status: "completed", completedAt: "2026-05-10T10:00:00.000Z", scheduledAt: null },
      { vehicleReg: "AB12CDE", status: "cancelled", completedAt: null, scheduledAt: "2026-08-10T10:00:00.000Z" },
      { vehicleReg: "S28 BSW", status: "completed", completedAt: null, scheduledAt: "2026-02-01T08:00:00.000Z" },
    ]);
    expect(latest.get("AB12CDE")).toBe("2026-05-10T10:00:00.000Z");
    expect(latest.get("S28BSW")).toBe("2026-02-01T08:00:00.000Z");
    expect(latest.size).toBe(2);
  });
});

describe("bookVehicleHref", () => {
  it("starts the booking flow with the plate", () => {
    expect(bookVehicleHref("AB12 CDE")).toBe("/book/vehicle?reg=AB12CDE");
  });
});
