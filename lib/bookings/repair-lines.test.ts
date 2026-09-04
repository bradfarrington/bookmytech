import { describe, expect, it } from "vitest";
import { groupRepairLines, isMultiJob, repairLinesFor, repairSummary } from "./repair-lines";

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
      },
    ]);
    expect(repairLinesFor(booking, null)).toHaveLength(1);
    expect(repairLinesFor({}, undefined)[0].description).toBe("Vehicle repair");
    expect(isMultiJob(lines)).toBe(false);
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
