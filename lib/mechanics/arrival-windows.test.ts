import { describe, it, expect } from "vitest";
import { ALL_DAY_SLOT, slotIso } from "@/lib/slots";
import {
  buildArrivalWindowOptions,
  type AvailabilityRow,
  type SiblingBooking,
} from "./arrival-windows";

// Pinned instants throughout — nothing reads the wall clock or the process
// zone. 27 Aug 2026 is a BST day (UTC+1); 15 Jan 2026 is GMT.

const BST_DAY = "2026-08-27";
const GMT_DAY = "2026-01-15";
/** A `now` well before the day so lead time never interferes. */
const EARLY = new Date("2026-01-01T00:00:00Z");

function sibling(over: Partial<SiblingBooking> & { scheduled_at: string }): SiblingBooking {
  return {
    id: over.id ?? "sib-1",
    job_number: over.job_number ?? 123,
    slot_window: over.slot_window ?? null,
    service_duration_hours: over.service_duration_hours ?? null,
    status: over.status ?? "confirmed",
    scheduled_at: over.scheduled_at,
  };
}

const hours = (start: string | null, end: string | null, is_active = true): AvailabilityRow => ({
  is_active,
  start_time: start,
  end_time: end,
});

function build(over: {
  dayKey?: string;
  availability?: AvailabilityRow | null;
  siblings?: SiblingBooking[];
  now?: Date;
}) {
  return buildArrivalWindowOptions({
    dayKey: over.dayKey ?? BST_DAY,
    availability: over.availability ?? null,
    siblings: over.siblings ?? [],
    now: over.now ?? EARLY,
  });
}

const byWindow = (r: ReturnType<typeof build>, window: string) =>
  r.options.find((o) => o.window === window)!;

describe("shape", () => {
  it("always returns the six 2-hour windows in order, with London start instants", () => {
    const r = build({});
    expect(r.options.map((o) => o.window)).toEqual([
      "8am–10am",
      "10am–12pm",
      "12pm–2pm",
      "2pm–4pm",
      "4pm–6pm",
      "6pm–8pm",
    ]);
    expect(byWindow(r, "8am–10am").iso).toBe("2026-08-27T07:00:00.000Z");
    expect(byWindow(r, "6pm–8pm").iso).toBe("2026-08-27T17:00:00.000Z");
    expect(r.anySelectable).toBe(true);
  });

  it("uses the same instants as slotIso on the DST switch days", () => {
    for (const day of ["2026-03-29", "2026-10-25"]) {
      const r = build({ dayKey: day });
      for (const o of r.options) expect(o.iso).toBe(slotIso(day, o.startHour));
    }
  });

  it("with no siblings and no saved hours, nothing is flagged", () => {
    const r = build({});
    expect(r.hours).toBeNull();
    expect(r.dayOff).toBe(false);
    expect(r.allDayJobs).toEqual([]);
    for (const o of r.options) {
      expect(o.clash).toBeNull();
      expect(o.outsideHours).toBe(false);
      expect(o.selectable).toBe(true);
    }
  });
});

describe("clashes with other timed jobs", () => {
  it("a 1-hour job at 8am–10am blocks only that window (a window is the minimum footprint)", () => {
    const r = build({
      siblings: [
        sibling({
          scheduled_at: slotIso(BST_DAY, 8),
          slot_window: "8am–10am",
          service_duration_hours: 1,
          job_number: 88,
        }),
      ],
    });
    expect(byWindow(r, "8am–10am").clash).toEqual({
      bookingId: "sib-1",
      jobNumber: "00088",
      window: "8am–10am",
    });
    expect(byWindow(r, "8am–10am").selectable).toBe(false);
    expect(byWindow(r, "10am–12pm").clash).toBeNull();
  });

  it("a 3-hour job at 10am runs to 1pm and blocks both 10am–12pm and 12pm–2pm", () => {
    const r = build({
      siblings: [
        sibling({
          scheduled_at: slotIso(BST_DAY, 10),
          slot_window: "10am–12pm",
          service_duration_hours: "3.00", // numeric arrives as a string
        }),
      ],
    });
    expect(byWindow(r, "8am–10am").clash).toBeNull();
    expect(byWindow(r, "10am–12pm").clash?.jobNumber).toBe("00123");
    expect(byWindow(r, "12pm–2pm").clash?.jobNumber).toBe("00123");
    expect(byWindow(r, "2pm–4pm").clash).toBeNull();
  });

  it("a legacy job with no window is labelled by its exact UK start time", () => {
    const r = build({
      dayKey: GMT_DAY,
      siblings: [sibling({ scheduled_at: "2026-01-15T14:30:00Z", slot_window: null })],
    });
    // 14:30 GMT occupies 14:30–16:30 → overlaps 2pm–4pm and 4pm–6pm.
    expect(byWindow(r, "2pm–4pm").clash?.window).toBe("14:30");
    expect(byWindow(r, "4pm–6pm").clash?.window).toBe("14:30");
    expect(byWindow(r, "12pm–2pm").clash).toBeNull();
  });

  it("an un-narrowed all-day sibling is listed but never blocks", () => {
    const r = build({
      siblings: [
        sibling({
          id: "all-day",
          job_number: 120,
          scheduled_at: slotIso(BST_DAY, 8),
          slot_window: ALL_DAY_SLOT.window,
        }),
      ],
    });
    expect(r.allDayJobs).toEqual([{ bookingId: "all-day", jobNumber: "00120" }]);
    for (const o of r.options) expect(o.clash).toBeNull();
  });

  it("completed and cancelled siblings are ignored", () => {
    const r = build({
      siblings: [
        sibling({ scheduled_at: slotIso(BST_DAY, 8), status: "completed" }),
        sibling({ id: "c", scheduled_at: slotIso(BST_DAY, 10), status: "cancelled" }),
      ],
    });
    for (const o of r.options) expect(o.clash).toBeNull();
  });

  it("en_route and in_progress siblings still occupy their window", () => {
    const r = build({
      siblings: [
        sibling({ scheduled_at: slotIso(BST_DAY, 12), slot_window: "12pm–2pm", status: "en_route" }),
        sibling({ id: "b", scheduled_at: slotIso(BST_DAY, 16), slot_window: "4pm–6pm", status: "in_progress" }),
      ],
    });
    expect(byWindow(r, "12pm–2pm").clash).not.toBeNull();
    expect(byWindow(r, "4pm–6pm").clash).not.toBeNull();
    expect(byWindow(r, "2pm–4pm").clash).toBeNull();
  });

  it("reports the earliest clashing job when two overlap the same window", () => {
    const r = build({
      siblings: [
        sibling({ id: "late", job_number: 2, scheduled_at: slotIso(BST_DAY, 10), service_duration_hours: 4 }),
        sibling({ id: "early", job_number: 1, scheduled_at: slotIso(BST_DAY, 8), service_duration_hours: 4 }),
      ],
    });
    // 8am job runs 8–12, 10am job runs 10–14: 10am–12pm overlaps both; earliest wins.
    expect(byWindow(r, "10am–12pm").clash?.bookingId).toBe("early");
  });
});

describe("saved weekly hours (advisory)", () => {
  it("08:00–18:00 flags only 6pm–8pm, and stays selectable", () => {
    const r = build({ availability: hours("08:00:00", "18:00:00") });
    expect(r.hours).toEqual({ start: "08:00", end: "18:00" });
    expect(r.options.filter((o) => o.outsideHours).map((o) => o.window)).toEqual(["6pm–8pm"]);
    expect(byWindow(r, "6pm–8pm").selectable).toBe(true);
  });

  it("a late start flags the morning windows that begin before it", () => {
    const r = build({ availability: hours("10:00:00", "20:00:00") });
    expect(r.options.filter((o) => o.outsideHours).map((o) => o.window)).toEqual(["8am–10am"]);
  });

  it("a day switched off flags every window and reports dayOff", () => {
    const r = build({ availability: hours("08:00:00", "18:00:00", false) });
    expect(r.dayOff).toBe(true);
    expect(r.hours).toBeNull();
    expect(r.options.every((o) => o.outsideHours)).toBe(true);
    expect(r.anySelectable).toBe(true);
  });

  it("an active day saved without times constrains nothing", () => {
    const r = build({ availability: hours(null, null) });
    expect(r.hours).toBeNull();
    expect(r.options.every((o) => !o.outsideHours)).toBe(true);
  });
});

describe("lead time", () => {
  it("at 09:05 UK the 8am and 10am windows are gone; 12pm is still open", () => {
    // 09:05 BST = 08:05Z
    const r = build({ now: new Date("2026-08-27T08:05:00Z") });
    expect(byWindow(r, "8am–10am").bookable).toBe(false);
    expect(byWindow(r, "10am–12pm").bookable).toBe(false);
    expect(byWindow(r, "12pm–2pm").bookable).toBe(true);
    expect(byWindow(r, "8am–10am").selectable).toBe(false);
  });

  it("nothing is selectable once the last window's lead time has passed", () => {
    // 17:01 BST = 16:01Z
    const r = build({ now: new Date("2026-08-27T16:01:00Z") });
    expect(r.anySelectable).toBe(false);
  });
});
