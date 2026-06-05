import { describe, it, expect } from "vitest";
import { deriveReminders } from "./derive";

// A fixed "now" so the tests are deterministic (Date.now() is unavailable to us
// in workflow scripts but fine in vitest; we still pass `now` explicitly).
const NOW = new Date("2026-06-05T12:00:00Z");

function typesOf(rs: ReturnType<typeof deriveReminders>) {
  return rs.map((r) => r.type).sort();
}

describe("deriveReminders", () => {
  it("always schedules an annual service ~12 months out", () => {
    const rs = deriveReminders({
      now: NOW,
      completedAt: new Date("2026-06-01T10:00:00Z"),
      serviceSlug: "full-service",
      motExpiry: null,
    });
    const annual = rs.find((r) => r.type === "annual_service");
    expect(annual).toBeDefined();
    // 2026-06-01 + 365d = 2027-06-01, normalised to 09:00 UTC.
    expect(annual!.scheduledFor.toISOString()).toBe("2027-06-01T09:00:00.000Z");
    expect(annual!.suggestionSlug).toBe("full-service");
  });

  it("schedules an MOT reminder 30 days before expiry", () => {
    const rs = deriveReminders({
      now: NOW,
      completedAt: new Date("2026-06-01T10:00:00Z"),
      serviceSlug: "diagnostic",
      motExpiry: new Date("2026-12-20T00:00:00Z"),
    });
    const mot = rs.find((r) => r.type === "mot_due");
    expect(mot).toBeDefined();
    expect(mot!.scheduledFor.toISOString()).toBe("2026-11-20T09:00:00.000Z");
    expect(mot!.suggestionSlug).toBe("mot-pre-check");
  });

  it("drops an MOT reminder whose 30-day lead has already passed", () => {
    const rs = deriveReminders({
      now: NOW,
      completedAt: new Date("2026-06-01T10:00:00Z"),
      serviceSlug: "diagnostic",
      // Expires in <30 days → 30-day-before is in the past → no reminder.
      motExpiry: new Date("2026-06-20T00:00:00Z"),
    });
    expect(rs.find((r) => r.type === "mot_due")).toBeUndefined();
  });

  it("only adds a brake follow-up for brake jobs", () => {
    const brakes = deriveReminders({
      now: NOW,
      completedAt: new Date("2026-06-01T10:00:00Z"),
      serviceSlug: "brakes-tyres",
      motExpiry: null,
    });
    expect(typesOf(brakes)).toContain("brake_check");
    const brakeCheck = brakes.find((r) => r.type === "brake_check");
    // +182 days from 2026-06-01.
    expect(brakeCheck!.scheduledFor.toISOString()).toBe("2026-11-30T09:00:00.000Z");

    const battery = deriveReminders({
      now: NOW,
      completedAt: new Date("2026-06-01T10:00:00Z"),
      serviceSlug: "battery",
      motExpiry: null,
    });
    expect(typesOf(battery)).not.toContain("brake_check");
  });

  it("schedules the next seasonal occurrences strictly in the future", () => {
    const rs = deriveReminders({
      now: NOW,
      completedAt: new Date("2026-06-01T10:00:00Z"),
      serviceSlug: "full-service",
      motExpiry: null,
    });
    const winter = rs.find((r) => r.type === "winter_battery");
    const summer = rs.find((r) => r.type === "summer_aircon");
    // After 5 Jun 2026: next 1 Oct is 2026; next 15 May is 2027.
    expect(winter!.scheduledFor.toISOString()).toBe("2026-10-01T09:00:00.000Z");
    expect(summer!.scheduledFor.toISOString()).toBe("2027-05-15T09:00:00.000Z");
    for (const r of rs) expect(r.scheduledFor.getTime()).toBeGreaterThan(NOW.getTime());
  });
});
