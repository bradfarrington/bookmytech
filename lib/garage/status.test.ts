import { describe, expect, it } from "vitest";

import { daysUntil, detailsStale, formatRegistration, motAlert, normaliseRegistration } from "./status";

const NOW = new Date("2026-09-15T09:00:00.000Z");

describe("registrations", () => {
  it("stores without spaces and shows the plate's own spacing", () => {
    expect(normaliseRegistration(" s28 bsw ")).toBe("S28BSW");
    expect(formatRegistration("S28BSW")).toBe("S28 BSW");
    expect(formatRegistration("ab12cde")).toBe("AB12 CDE");
    expect(formatRegistration("ABC123D")).toBe("ABC 123D");
    expect(formatRegistration("1ABC")).toBe("1ABC");
  });
});

describe("daysUntil", () => {
  it("counts whole days to a DVLA date", () => {
    expect(daysUntil("2026-09-16", NOW)).toBe(2);
    expect(daysUntil("2026-09-15", NOW)).toBe(1);
    expect(daysUntil("2026-09-14", NOW)).toBe(0);
    expect(daysUntil("2026-09-10", NOW)).toBe(-4);
  });

  it("has nothing to say without a date", () => {
    expect(daysUntil(null, NOW)).toBeNull();
    expect(daysUntil("soon", NOW)).toBeNull();
  });
});

describe("detailsStale", () => {
  const checked = (hoursAgo: number) => new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString();

  it("always wants a first check", () => {
    expect(detailsStale({ detailsCheckedAt: null, motExpiryDate: null, taxDueDate: null }, NOW)).toBe(true);
  });

  it("waits a week when nothing is due", () => {
    const vehicle = { motExpiryDate: "2027-03-01", taxDueDate: "2027-01-01" };
    expect(detailsStale({ ...vehicle, detailsCheckedAt: checked(6 * 24) }, NOW)).toBe(false);
    expect(detailsStale({ ...vehicle, detailsCheckedAt: checked(7 * 24) }, NOW)).toBe(true);
  });

  it("checks daily once the MOT or tax is due within 30 days", () => {
    const vehicle = { motExpiryDate: "2026-10-01", taxDueDate: "2027-01-01" };
    expect(detailsStale({ ...vehicle, detailsCheckedAt: checked(12) }, NOW)).toBe(false);
    expect(detailsStale({ ...vehicle, detailsCheckedAt: checked(25) }, NOW)).toBe(true);
  });
});

describe("motAlert", () => {
  it("warns 30 days out and once expired", () => {
    expect(motAlert("2026-12-01", NOW)).toBeNull();
    expect(motAlert("2026-10-10", NOW)).toEqual({ kind: "due_soon", days: 26 });
    expect(motAlert("2026-09-01", NOW)).toMatchObject({ kind: "expired" });
    expect(motAlert(null, NOW)).toBeNull();
  });
});
