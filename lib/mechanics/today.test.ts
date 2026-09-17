import { describe, it, expect } from "vitest";
import {
  acceptRateOf,
  leaveByIso,
  nextShiftStart,
  parseResume,
  recapPushBody,
  routeMiles,
  tomorrowPushBody,
  type ShiftRow,
} from "./today";

// Pinned instants throughout. 17 Sep 2026 is a Thursday in BST (UTC+1);
// 15 Jan 2026 is a Thursday in GMT.

describe("leaveByIso", () => {
  it("takes the drive at 20 mph plus 10 minutes off the window start", () => {
    // 10 miles → 30 min + 10 = 40 min before 08:00 BST (07:00Z).
    expect(leaveByIso("2026-09-18T07:00:00.000Z", 10)).toBe("2026-09-18T06:20:00.000Z");
  });

  it("rounds down to five minutes", () => {
    // 1.2 miles → 3.6 + 10 = 13.6 min → 07:46:24 → 07:45.
    expect(leaveByIso("2026-01-15T08:00:00.000Z", 1.2)).toBe("2026-01-15T07:45:00.000Z");
  });
});

describe("acceptRateOf", () => {
  it("is accepted over answered, as a whole number", () => {
    expect(acceptRateOf(22, 3)).toEqual({ percent: 88, accepted: 22, answered: 25, windowDays: 30 });
  });

  it("has no percentage when nothing was answered", () => {
    expect(acceptRateOf(0, 0).percent).toBeNull();
  });
});

describe("routeMiles", () => {
  const a = { lat: 52.95, lng: -1.15 };
  const b = { lat: 52.9, lng: -1.1 };

  it("is zero for an empty day and null when a leg is missing", () => {
    expect(routeMiles(null, [])).toBe(0);
    expect(routeMiles(null, [a])).toBeNull();
    expect(routeMiles(a, [b, null])).toBeNull();
  });

  it("chains the legs rather than measuring each from base", () => {
    const there = routeMiles(a, [b])!;
    expect(there).toBeGreaterThan(0);
    // The second stop is back where we started: twice the distance, within rounding.
    expect(Math.abs(routeMiles(a, [b, a])! - there * 2)).toBeLessThanOrEqual(0.1);
  });
});

describe("parseResume", () => {
  it("accepts the three choices and absence", () => {
    expect(parseResume(undefined)).toBeUndefined();
    expect(parseResume(null)).toBeUndefined();
    expect(parseResume({ minutes: 30 })).toEqual({ minutes: 30 });
    expect(parseResume({ minutes: 60 })).toEqual({ minutes: 60 });
    expect(parseResume({ at: "next_shift" })).toEqual({ at: "next_shift" });
  });

  it("refuses everything else", () => {
    for (const bad of [{ minutes: 45 }, { minutes: "30" }, { at: "tomorrow" }, {}, "30", [30], { minutes: 30, at: "next_shift" }]) {
      expect(parseResume(bad)).toBeNull();
    }
  });
});

describe("nextShiftStart", () => {
  const day = (day_of_week: number, start_time: string | null, is_active = true): ShiftRow => ({
    day_of_week,
    start_time,
    is_active,
  });

  it("is today's start when it hasn't begun", () => {
    const now = new Date("2026-09-17T05:00:00Z"); // Thu 06:00 BST
    expect(nextShiftStart([day(4, "08:30:00")], now)?.toISOString()).toBe("2026-09-17T07:30:00.000Z");
  });

  it("skips to the next active day once today's has started, ignoring inactive ones", () => {
    const now = new Date("2026-09-17T12:00:00Z"); // Thu 13:00 BST
    const rows = [day(4, "08:30:00"), day(5, "09:00:00", false), day(1, "09:00:00")];
    expect(nextShiftStart(rows, now)?.toISOString()).toBe("2026-09-21T08:00:00.000Z"); // Mon 09:00 BST
  });

  it("comes round to the same weekday next week", () => {
    const now = new Date("2026-01-15T12:00:00Z"); // Thu, GMT
    expect(nextShiftStart([day(4, "08:00:00")], now)?.toISOString()).toBe("2026-01-22T08:00:00.000Z");
  });

  it("starts a day saved without hours at 8am, and is null with no active day", () => {
    const now = new Date("2026-01-15T05:00:00Z");
    expect(nextShiftStart([day(4, null)], now)?.toISOString()).toBe("2026-01-15T08:00:00.000Z");
    expect(nextShiftStart([day(4, "08:00:00", false)], now)).toBeNull();
    expect(nextShiftStart([], now)).toBeNull();
  });
});

describe("push copy", () => {
  it("writes tomorrow's line in UK time", () => {
    expect(
      tomorrowPushBody({ jobCount: 4, bookedPence: 34000, firstAt: "2026-09-18T07:30:00.000Z", firstArea: "SE21" }),
    ).toBe("4 jobs · £340 · first at 08:30 in SE21");
    expect(
      tomorrowPushBody({ jobCount: 1, bookedPence: 8550, firstAt: "2026-01-16T10:00:00.000Z", firstArea: null }),
    ).toBe("1 job · £85.50 · first at 10:00");
  });

  it("writes the recap", () => {
    expect(recapPushBody(24800, 4)).toBe("You earned £248 today across 4 jobs.");
    expect(recapPushBody(6000, 1)).toBe("You earned £60 today across 1 job.");
  });
});
