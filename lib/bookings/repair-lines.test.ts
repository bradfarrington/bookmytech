import { describe, expect, it } from "vitest";
import { bookingRepairRows, groupRepairLines, isMultiJob, repairLinesFor, repairSummary } from "./repair-lines";

describe("groupRepairLines", () => {
  it("groups a combined repair's jobs under its label and leaves plain jobs alone", () => {
    const groups = groupRepairLines([
      { nodeId: "d", itemId: "b:front", itemLabel: "Brake pads & discs · Front" },
      { nodeId: "p", itemId: "b:front", itemLabel: "Brake pads & discs · Front" },
      { nodeId: "r", itemId: "r", itemLabel: null },
    ]);
    expect(groups.map((g) => [g.label, g.lines.length])).toEqual([
      ["Brake pads & discs · Front", 2],
      [null, 1],
    ]);
  });
});

describe("repairSummary", () => {
  it("names one job, and counts the rest", () => {
    expect(repairSummary(["Renew the alternator"])).toBe("Renew the alternator");
    expect(repairSummary(["Renew the alternator", "Renew the air filter"])).toBe(
      "Renew the alternator + 1 more job",
    );
    expect(repairSummary(["A", "B", "C"])).toBe("A + 2 more jobs");
  });

  it("ignores blanks and falls back when there is nothing", () => {
    expect(repairSummary([" A ", "", "  "])).toBe("A");
    expect(repairSummary([])).toBe("Vehicle repair");
  });
});

describe("repairLinesFor", () => {
  const booking = {
    repair_node_id: "1M01510000WV0",
    repair_description: "Renew the front brake pads",
    vehicle_raw_duration_hours: "0.80",
  };

  it("synthesises one line for a booking with no rows (single or pre-Task-24)", () => {
    const lines = repairLinesFor(booking, []);
    expect(lines).toEqual([
      {
        position: 0,
        nodeId: "1M01510000WV0",
        description: "Renew the front brake pads",
        rawHours: 0.8,
        chargedHours: null,
        linePence: null,
        itemId: null,
        itemLabel: null,
        synthetic: true,
        product: false,
      },
    ]);
    expect(repairLinesFor(booking, null)).toHaveLength(1);
    expect(repairLinesFor({}, undefined)[0].description).toBe("Vehicle repair");
    expect(isMultiJob(lines)).toBe(false);
  });

  it("flags a fixed-price product line (Task 31) from its kind or its p: id", () => {
    expect(repairLinesFor({ repair_node_id: "p:abc", repair_description: "Full service" }, [])[0].product).toBe(true);
    const lines = repairLinesFor(booking, [
      { position: 0, node_id: "p:abc", description: "Plug-in diagnostic", raw_hours: "0", charged_hours: "0", line_pence: 5999, kind: "product" },
      { position: 1, node_id: "1M01510000WV0", description: "Renew the front brake pads", raw_hours: "0.80", charged_hours: "0.80", line_pence: 4800 },
    ]);
    expect(lines.map((l) => l.product)).toEqual([true, false]);
  });

  it("returns the rows sorted by position, coercing numerics", () => {
    const lines = repairLinesFor(booking, [
      { position: 1, node_id: "1M01510000WV0", description: "Renew the front brake pads", raw_hours: "0.80", charged_hours: "0.00", line_pence: 0 },
      { position: 0, node_id: "1M01822000WV0", description: "Renew both front brake discs", raw_hours: 1.1, charged_hours: 1.1, line_pence: 6600 },
    ]);
    expect(lines.map((l) => l.nodeId)).toEqual(["1M01822000WV0", "1M01510000WV0"]);
    expect(lines[1]).toMatchObject({ rawHours: 0.8, chargedHours: 0, linePence: 0, synthetic: false });
    expect(isMultiJob(lines)).toBe(true);
  });

  it("skips malformed rows and falls back to the booking when none remain", () => {
    const lines = repairLinesFor(booking, [
      { position: 0, node_id: "", description: "x", raw_hours: 1, charged_hours: 1, line_pence: 1 },
    ]);
    expect(lines[0].synthetic).toBe(true);
  });
});

describe("bookingRepairRows", () => {
  // supabase-js fills a key one row lacks with NULL (not the default), so a
  // job row without `kind` beside a product row broke kind's not-null.
  it("gives every row the same keys when jobs, combined repairs and products mix", () => {
    const rows = bookingRepairRows("b1", [
      { nodeId: "1", description: "Pads", rawHours: 0.7, chargedHours: 0.7, linePence: 4200, itemId: "c:1", itemLabel: "Pads and discs" },
      { nodeId: "p:svc", description: "Full service", rawHours: 0, chargedHours: 0, linePence: 18000, itemId: "p:svc", itemLabel: null, kind: "product" },
      { nodeId: "2", description: "Stabiliser link", rawHours: 0.4, chargedHours: 0.4, linePence: 2400, itemId: "2", itemLabel: null },
    ]);
    const keys = rows.map((r) => Object.keys(r).sort().join(","));
    expect(new Set(keys).size).toBe(1);
    expect(rows.map((r) => r.kind)).toEqual(["job", "product", "job"]);
    expect(rows.map((r) => r.position)).toEqual([0, 1, 2]);
    expect(rows[0]).toMatchObject({ item_id: "c:1", item_label: "Pads and discs" });
    expect(rows[2]).toMatchObject({ item_id: null, item_label: null });
  });
});
