import { describe, expect, it } from "vitest";

import { ALL_DAY_SLOT } from "@/lib/slots";

import { countMechanicsPerWindow, type MechanicDay } from "./window-counts";

// A Wednesday, well ahead of "now", so every window is bookable.
const DAY = "2026-09-23";
const NOW = new Date("2026-09-15T09:00:00.000Z");

const counts = (mechanics: MechanicDay[]) =>
  Object.fromEntries(countMechanicsPerWindow(DAY, mechanics, NOW).map((w) => [w.window, w.mechanics]));

describe("countMechanicsPerWindow", () => {
  it("counts a mechanic with no saved hours as free all day", () => {
    const result = countMechanicsPerWindow(DAY, [{ mechanicId: "a", availability: null, siblings: [] }], NOW);
    expect(result.every((w) => w.mechanics === 1 && w.bookable)).toBe(true);
    expect(result.at(-1)).toMatchObject({ window: ALL_DAY_SLOT.window, startHour: null });
  });

  it("leaves out windows outside a mechanic's hours, and a day off entirely", () => {
    const result = counts([
      { mechanicId: "short-day", availability: { is_active: true, start_time: "10:00:00", end_time: "14:00:00" }, siblings: [] },
      { mechanicId: "day-off", availability: { is_active: false, start_time: null, end_time: null }, siblings: [] },
    ]);
    const windows = Object.entries(result).filter(([window]) => window !== ALL_DAY_SLOT.window);
    expect(windows.filter(([, n]) => n === 1).length).toBe(2);
    expect(result[ALL_DAY_SLOT.window]).toBe(1);
  });

  it("leaves out a window that clashes with another timed job", () => {
    const busy: MechanicDay = {
      mechanicId: "busy",
      availability: null,
      siblings: [
        {
          id: "job",
          job_number: 12,
          // 10am to 12pm London (BST).
          scheduled_at: "2026-09-23T09:00:00.000Z",
          slot_window: "10am–12pm",
          service_duration_hours: 1,
          status: "confirmed",
        },
      ],
    };
    const free: MechanicDay = { mechanicId: "free", availability: null, siblings: [] };
    const all = countMechanicsPerWindow(DAY, [busy, free], NOW);
    const clashed = all.filter((w) => w.mechanics === 1);
    expect(clashed).toHaveLength(1);
    expect(clashed[0].startHour).toBe(10);
    expect(all.at(-1)?.mechanics).toBe(2);
  });

  it("counts nobody when nobody covers the area", () => {
    expect(countMechanicsPerWindow(DAY, [], NOW).every((w) => w.mechanics === 0)).toBe(true);
  });
});
