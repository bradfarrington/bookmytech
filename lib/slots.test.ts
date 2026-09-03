import { describe, it, expect } from "vitest";
import {
  ALL_DAY_SLOT,
  TWO_HOUR_SLOTS,
  addDaysToKey,
  dayChipLabel,
  dayHasBookableSlot,
  dayOfWeekForKey,
  daysBetweenKeys,
  formatBookingSlot,
  isSlotBookable,
  londonDateKey,
  londonInstant,
  slotIso,
  twoHourSlotByWindow,
  upcomingDayKeys,
} from "./slots";

// Everything here is pinned to explicit instants; nothing reads the wall clock
// or the process time zone, so the suite passes identically on a UTC CI box, a
// BST laptop, or anything else.

const slot = (window: string) => TWO_HOUR_SLOTS.find((s) => s.window === window)!;

describe("londonInstant / slotIso", () => {
  it("8am on a BST day is 07:00Z", () => {
    expect(slotIso("2026-08-27", 8)).toBe("2026-08-27T07:00:00.000Z");
  });

  it("8am on a GMT day is 08:00Z", () => {
    expect(slotIso("2026-01-15", 8)).toBe("2026-01-15T08:00:00.000Z");
  });

  it("resolves the spring-forward day (clocks go to BST at 01:00Z)", () => {
    // 29 Mar 2026: 8am BST = 07:00Z
    expect(slotIso("2026-03-29", 8)).toBe("2026-03-29T07:00:00.000Z");
  });

  it("resolves the fall-back day (clocks go to GMT at 01:00Z)", () => {
    // 25 Oct 2026: 8am GMT = 08:00Z
    expect(slotIso("2026-10-25", 8)).toBe("2026-10-25T08:00:00.000Z");
  });
});

describe("londonDateKey", () => {
  it("uses the UK calendar date, not UTC", () => {
    // 23:30Z on 26 Aug is 00:30 BST on 27 Aug.
    expect(londonDateKey(new Date("2026-08-26T23:30:00Z"))).toBe("2026-08-27");
    expect(londonDateKey(new Date("2026-01-26T23:30:00Z"))).toBe("2026-01-26");
  });

  it("round-trips through londonInstant", () => {
    expect(londonDateKey(londonInstant("2026-08-27", 18))).toBe("2026-08-27");
  });
});

describe("calendar key arithmetic", () => {
  it("adds days across a month boundary", () => {
    expect(addDaysToKey("2026-08-30", 3)).toBe("2026-09-02");
  });

  it("counts whole days between keys", () => {
    expect(daysBetweenKeys("2026-08-27", "2026-08-27")).toBe(0);
    expect(daysBetweenKeys("2026-08-27", "2026-08-28")).toBe(1);
    expect(daysBetweenKeys("2026-08-28", "2026-08-27")).toBe(-1);
  });

  it("upcomingDayKeys starts on the UK today", () => {
    const keys = upcomingDayKeys(new Date("2026-08-26T23:30:00Z"));
    expect(keys).toHaveLength(7);
    expect(keys[0]).toBe("2026-08-27");
    expect(keys[6]).toBe("2026-09-02");
  });

  it("dayOfWeekForKey is plain calendar arithmetic (0 = Sunday)", () => {
    expect(dayOfWeekForKey("2026-09-03")).toBe(4); // Thursday
    expect(dayOfWeekForKey("2026-09-06")).toBe(0); // Sunday
    expect(dayOfWeekForKey("2026-09-07")).toBe(1); // Monday
  });
});

describe("twoHourSlotByWindow", () => {
  it("finds a 2-hour window by its stored label", () => {
    expect(twoHourSlotByWindow("2pm–4pm")).toEqual({ window: "2pm–4pm", startHour: 14 });
  });

  it("never matches the all-day label, a hyphenated variant, or nothing", () => {
    expect(twoHourSlotByWindow(ALL_DAY_SLOT.window)).toBeNull();
    expect(twoHourSlotByWindow("2pm-4pm")).toBeNull();
    expect(twoHourSlotByWindow(null)).toBeNull();
    expect(twoHourSlotByWindow("")).toBeNull();
  });
});

describe("isSlotBookable (UK time, 60-minute lead)", () => {
  // 12:30 BST on 27 Aug 2026 (11:30Z).
  const NOW = new Date("2026-08-27T11:30:00Z");
  const TODAY = "2026-08-27";

  it("hides windows that have started", () => {
    expect(isSlotBookable(TODAY, slot("8am–10am"), NOW)).toBe(false);
    expect(isSlotBookable(TODAY, slot("10am–12pm"), NOW)).toBe(false);
    expect(isSlotBookable(TODAY, slot("12pm–2pm"), NOW)).toBe(false);
  });

  it("hides a window starting inside the lead time", () => {
    // 2pm is 90 minutes away → bookable; at 13:05 it would not be.
    expect(isSlotBookable(TODAY, slot("2pm–4pm"), NOW)).toBe(true);
    expect(isSlotBookable(TODAY, slot("2pm–4pm"), new Date("2026-08-27T12:05:00Z"))).toBe(false);
    // Exactly 60 minutes out is still allowed.
    expect(isSlotBookable(TODAY, slot("2pm–4pm"), new Date("2026-08-27T12:00:00Z"))).toBe(true);
  });

  it("keeps later windows", () => {
    expect(isSlotBookable(TODAY, slot("4pm–6pm"), NOW)).toBe(true);
    expect(isSlotBookable(TODAY, slot("6pm–8pm"), NOW)).toBe(true);
  });

  it("closes the all-day window once 8am has gone", () => {
    expect(isSlotBookable(TODAY, ALL_DAY_SLOT, NOW)).toBe(false);
    expect(isSlotBookable(TODAY, ALL_DAY_SLOT, new Date("2026-08-27T05:00:00Z"))).toBe(true);
  });

  it("is judged in UK time regardless of the caller's zone", () => {
    // 17:30 BST (16:30Z): the 6pm window is 30 minutes away → closed.
    // Read as UTC it would look like 16:30 with 90 minutes to go.
    expect(isSlotBookable(TODAY, slot("6pm–8pm"), new Date("2026-08-27T16:30:00Z"))).toBe(false);
  });

  it("everything on a future day is bookable", () => {
    for (const s of TWO_HOUR_SLOTS) expect(isSlotBookable("2026-08-28", s, NOW)).toBe(true);
    expect(isSlotBookable("2026-08-28", ALL_DAY_SLOT, NOW)).toBe(true);
  });
});

describe("dayHasBookableSlot", () => {
  it("is false for today once the last window's lead time has passed (after 5pm UK)", () => {
    // 6pm–8pm needs a 5pm cut-off: 16:00Z is 5pm BST exactly (still open),
    // a minute later it's gone.
    expect(dayHasBookableSlot("2026-08-27", new Date("2026-08-27T16:00:00Z"))).toBe(true);
    expect(dayHasBookableSlot("2026-08-27", new Date("2026-08-27T16:01:00Z"))).toBe(false);
  });

  it("is true for tomorrow", () => {
    expect(dayHasBookableSlot("2026-08-28", new Date("2026-08-27T22:00:00Z"))).toBe(true);
  });
});

describe("dayChipLabel", () => {
  const NOW = new Date("2026-08-27T11:30:00Z");

  it("labels today and tomorrow, then weekdays", () => {
    expect(dayChipLabel("2026-08-27", NOW)).toEqual({ weekday: "Today", dayOfMonth: "27" });
    expect(dayChipLabel("2026-08-28", NOW)).toEqual({ weekday: "Tmrw", dayOfMonth: "28" });
    expect(dayChipLabel("2026-08-29", NOW)).toEqual({ weekday: "Sat", dayOfMonth: "29" });
    expect(dayChipLabel("2026-09-01", NOW)).toEqual({ weekday: "Tue", dayOfMonth: "1" });
  });
});

describe("formatBookingSlot", () => {
  it("shows the stored window with the UK day", () => {
    expect(formatBookingSlot("2026-08-27T07:00:00Z", "8am–10am")).toBe("Thu 27 Aug · 8am–10am");
  });

  it("falls back to the exact UK time (not UTC) when no window is stored", () => {
    // 17:00Z is 6pm BST.
    expect(formatBookingSlot("2026-08-27T17:00:00Z")).toBe("Thu 27 Aug · 18:00");
  });

  it("relative mode compares UK calendar days", () => {
    const now = new Date("2026-08-27T22:30:00Z"); // 23:30 BST on the 27th
    expect(formatBookingSlot("2026-08-27T17:00:00Z", "6pm–8pm", { relative: true, now })).toBe(
      "Today · 6pm–8pm",
    );
    expect(formatBookingSlot("2026-08-28T07:00:00Z", "8am–10am", { relative: true, now })).toBe(
      "Tomorrow · 8am–10am",
    );
  });

  it("handles a missing time", () => {
    expect(formatBookingSlot(null)).toBe("Time to be confirmed");
  });
});
