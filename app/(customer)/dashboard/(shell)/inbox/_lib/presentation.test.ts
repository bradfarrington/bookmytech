import { describe, expect, it } from "vitest";

import {
  filterInboxTab,
  groupInboxByDay,
  inboxDayLabel,
  inboxDetail,
  inboxHref,
  inboxTimeLabel,
  inboxVisual,
  parseInboxTab,
} from "./presentation";

// 10:00 in London (BST), Tuesday 15 September 2026.
const NOW = new Date("2026-09-15T09:00:00.000Z");

const booking = (type: string, status: string | null = null) => ({ kind: "booking" as const, type, status });

describe("tabs", () => {
  it("reads ?tab= and falls back to All", () => {
    expect(parseInboxTab("bookings")).toBe("bookings");
    expect(parseInboxTab(["reminders", "all"])).toBe("reminders");
    expect(parseInboxTab("nonsense")).toBe("all");
    expect(parseInboxTab(undefined)).toBe("all");
  });

  it("filters by kind", () => {
    const items = [{ kind: "booking" as const }, { kind: "reminder" as const }, { kind: "booking" as const }];
    expect(filterInboxTab(items, "all")).toHaveLength(3);
    expect(filterInboxTab(items, "bookings")).toHaveLength(2);
    expect(filterInboxTab(items, "reminders")).toHaveLength(1);
  });
});

describe("inboxDayLabel", () => {
  it("says Today and Yesterday by the London calendar", () => {
    expect(inboxDayLabel("2026-09-15T06:00:00.000Z", NOW)).toBe("Today");
    // 00:30 on the 15th in London, though still the 14th in UTC.
    expect(inboxDayLabel("2026-09-14T23:30:00.000Z", NOW)).toBe("Today");
    // 23:30 on the 14th in London.
    expect(inboxDayLabel("2026-09-14T22:30:00.000Z", NOW)).toBe("Yesterday");
  });

  it("names older days, with the year only when it isn't this year", () => {
    expect(inboxDayLabel("2026-09-08T10:00:00.000Z", NOW)).toMatch(/^Tue 8 Sept?$/);
    expect(inboxDayLabel("2025-12-24T10:00:00.000Z", NOW)).toBe("Wed 24 Dec 2025");
  });
});

describe("inboxTimeLabel", () => {
  it("shows London time on a 24-hour clock", () => {
    expect(inboxTimeLabel("2026-09-15T08:23:00.000Z")).toBe("09:23");
    expect(inboxTimeLabel("2026-01-15T15:02:00.000Z")).toBe("15:02");
  });
});

describe("groupInboxByDay", () => {
  it("keeps the feed's order under each day", () => {
    const groups = groupInboxByDay(
      [
        { id: "a", at: "2026-09-15T08:00:00.000Z" },
        { id: "b", at: "2026-09-15T07:00:00.000Z" },
        { id: "c", at: "2026-09-14T12:00:00.000Z" },
        { id: "d", at: "2026-09-10T12:00:00.000Z" },
      ],
      NOW,
    );
    expect(groups.map((group) => group.label)).toEqual(["Today", "Yesterday", expect.stringMatching(/^Thu 10 Sept?$/)]);
    expect(groups[0].items.map((item) => item.id)).toEqual(["a", "b"]);
  });
});

describe("inboxVisual", () => {
  it("shows a car while the mechanic is on the way or working", () => {
    expect(inboxVisual(booking("status_changed", "en_route"))).toEqual({ icon: "car", tone: "brand" });
    expect(inboxVisual(booking("status_changed", "in_progress"))).toEqual({ icon: "car", tone: "brand" });
  });

  it("ticks good outcomes and crosses ended ones", () => {
    expect(inboxVisual(booking("status_changed", "completed"))).toEqual({ icon: "check", tone: "success" });
    expect(inboxVisual(booking("status_changed", "confirmed"))).toEqual({ icon: "check", tone: "success" });
    expect(inboxVisual(booking("quote_approved"))).toEqual({ icon: "check", tone: "success" });
    expect(inboxVisual(booking("reschedule_accepted"))).toEqual({ icon: "check", tone: "success" });
    expect(inboxVisual(booking("cancelled"))).toEqual({ icon: "cross", tone: "neutral" });
    expect(inboxVisual(booking("revision_declined"))).toEqual({ icon: "cross", tone: "neutral" });
    expect(inboxVisual(booking("quote_withdrawn"))).toEqual({ icon: "cross", tone: "neutral" });
    expect(inboxVisual(booking("quote_expired"))).toEqual({ icon: "cross", tone: "neutral" });
  });

  it("flags quotes, revisions and disputes that need a look", () => {
    expect(inboxVisual(booking("quote_sent"))).toEqual({ icon: "quote", tone: "warn" });
    expect(inboxVisual(booking("revision_sent"))).toEqual({ icon: "quote", tone: "warn" });
    expect(inboxVisual(booking("dispute_opened"))).toEqual({ icon: "dispute", tone: "warn" });
    expect(inboxVisual(booking("disputed"))).toEqual({ icon: "dispute", tone: "warn" });
  });

  it("shows payments with a card and reminders with a bell", () => {
    expect(inboxVisual(booking("payment_captured"))).toEqual({ icon: "card", tone: "brand" });
    expect(inboxVisual(booking("payment_refunded"))).toEqual({ icon: "card", tone: "brand" });
    expect(inboxVisual({ kind: "reminder", type: "mot_due", status: null })).toEqual({ icon: "bell", tone: "brand" });
  });
});

describe("opening an item", () => {
  it("goes to the booking, or books the reminder's vehicle", () => {
    expect(inboxHref({ kind: "booking", bookingId: "b-1", vehicleReg: null })).toBe("/dashboard/bookings/b-1");
    expect(inboxHref({ kind: "reminder", bookingId: null, vehicleReg: "ab12 cde" })).toBe("/book/vehicle?reg=AB12CDE");
    expect(inboxHref({ kind: "reminder", bookingId: null, vehicleReg: null })).toBe("/book");
  });

  it("shows the job for booking news and the plate for a reminder", () => {
    expect(inboxDetail({ kind: "booking", detail: "Front brake pads", vehicleReg: null })).toBe("Front brake pads");
    expect(inboxDetail({ kind: "reminder", detail: "AB12CDE", vehicleReg: "AB12CDE" })).toBe("AB12 CDE");
  });
});
