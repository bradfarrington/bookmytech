import { describe, expect, it } from "vitest";
import { ALL_DAY_SLOT, TWO_HOUR_SLOTS, slotIso } from "@/lib/slots";
import { rescheduleSlotWindow } from "./reschedule-window";

// Pinned instants only; nothing reads the wall clock or the process time zone.

describe("rescheduleSlotWindow", () => {
  it("keeps a 2-hour window whose start matches, on a BST day", () => {
    // 2pm BST on 27 Aug 2026 is 13:00Z.
    expect(rescheduleSlotWindow("2026-08-27T13:00:00.000Z", "2pm–4pm")).toBe("2pm–4pm");
  });

  it("keeps a 2-hour window whose start matches, on a GMT day", () => {
    expect(rescheduleSlotWindow("2026-01-15T14:00:00.000Z", "2pm–4pm")).toBe("2pm–4pm");
  });

  it("keeps every one of the six windows at its own start", () => {
    for (const slot of TWO_HOUR_SLOTS) {
      expect(rescheduleSlotWindow(slotIso("2026-09-18", slot.startHour), slot.window)).toBe(slot.window);
    }
  });

  it("accepts the same instant written with an offset", () => {
    expect(rescheduleSlotWindow("2026-08-27T14:00:00+01:00", "2pm–4pm")).toBe("2pm–4pm");
  });

  it("drops a window whose start doesn't match the new time", () => {
    expect(rescheduleSlotWindow("2026-08-27T13:30:00.000Z", "2pm–4pm")).toBeNull();
    expect(rescheduleSlotWindow("2026-08-27T13:00:00.000Z", "8am–10am")).toBeNull();
    // 14:00Z is 3pm BST, an hour into the window, not its start.
    expect(rescheduleSlotWindow("2026-08-27T14:00:00.000Z", "2pm–4pm")).toBeNull();
  });

  it("drops the all-day window: a reschedule can't carry it", () => {
    expect(rescheduleSlotWindow(slotIso("2026-09-18", ALL_DAY_SLOT.startHour), ALL_DAY_SLOT.window)).toBeNull();
  });

  it("drops anything that isn't exactly a window label", () => {
    const iso = "2026-08-27T13:00:00.000Z";
    expect(rescheduleSlotWindow(iso, undefined)).toBeNull();
    expect(rescheduleSlotWindow(iso, null)).toBeNull();
    expect(rescheduleSlotWindow(iso, 14)).toBeNull();
    expect(rescheduleSlotWindow(iso, "")).toBeNull();
    expect(rescheduleSlotWindow(iso, "2pm-4pm")).toBeNull(); // hyphen, not an en dash
    expect(rescheduleSlotWindow(iso, " 2pm–4pm")).toBeNull();
  });

  it("drops a window when the new time isn't a valid instant", () => {
    expect(rescheduleSlotWindow("not a date", "2pm–4pm")).toBeNull();
    expect(rescheduleSlotWindow("", "2pm–4pm")).toBeNull();
  });

  it("uses the UK day, not the UTC day, around midnight", () => {
    // 23:00Z on 26 Aug is midnight BST on 27 Aug: not any window's start.
    expect(rescheduleSlotWindow("2026-08-26T23:00:00.000Z", "8am–10am")).toBeNull();
    // 07:00Z on 27 Aug is 8am BST on 27 Aug.
    expect(rescheduleSlotWindow("2026-08-27T07:00:00.000Z", "8am–10am")).toBe("8am–10am");
  });
});
