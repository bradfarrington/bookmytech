import { describe, expect, it } from "vitest";
import { buildRepairsQuote, type QuotableItem } from "./repair-booking";

// Pure quote assembly. Rate £60/h = 6000p, commission 15%.
const RATE = 6000;
const COMMISSION = 0.15;

const discs = { id: "1M01822000WV0", description: "Renew both front brake discs", rawHours: 1.1 };
const pads = { id: "1M01510000WV0", description: "Renew the front brake pads", rawHours: 0.8 };
const rearPads = { id: "1M01534000WV0", description: "Renew the rear brake pads", rawHours: 0.8 };

const plain = (node: typeof pads): QuotableItem => ({ id: node.id, label: null, nodes: [node] });

describe("buildRepairsQuote", () => {
  it("prices a single job exactly as before Task 24 (min 1h, no combine)", () => {
    const quote = buildRepairsQuote({ items: [plain(pads)], combined: null, hourlyRatePence: RATE, commissionRate: COMMISSION });
    expect(quote).not.toBeNull();
    expect(quote!.combineSource).toBeNull();
    expect(quote!.combinedRawHours).toBe(0.8);
    expect(quote!.billedHours).toBe(1);
    expect(quote!.breakdown.totalPence).toBe(6000);
    expect(quote!.breakdown.durationSource).toBe("vehicle");
    expect(quote!.breakdown.vehicleRawDurationHours).toBe(0.8);
    expect(quote!.description).toBe("Renew the front brake pads");
    expect(quote!.itemIds).toEqual([pads.id]);
    expect(quote!.nodeIds).toEqual([pads.id]);
    expect(quote!.lines).toEqual([
      { nodeId: pads.id, description: pads.description, rawHours: 0.8, chargedHours: 0.8, linePence: 4800, itemId: pads.id, itemLabel: null },
    ]);
  });

  it("adds each job's book time by default", () => {
    const quote = buildRepairsQuote({ items: [plain(discs), plain(pads)], combined: null, hourlyRatePence: RATE, commissionRate: COMMISSION });
    expect(quote!.combineSource).toBe("sum");
    expect(quote!.combinedRawHours).toBe(1.9);
    expect(quote!.billedHours).toBe(1.9);
    expect(quote!.breakdown.totalPence).toBe(11400);
    expect(quote!.lines.map((l) => l.chargedHours)).toEqual([1.1, 0.8]);
    expect(quote!.description).toBe("Renew both front brake discs + 1 more job");
  });

  it("uses HaynesPro's combined time when the basket is supplied", () => {
    const quote = buildRepairsQuote({
      items: [plain(discs), plain(pads)],
      combined: {
        totalRepairTime: 110,
        items: [
          { id: discs.id, description: discs.description, calculatedTime: 110, jobType: "MECHANICAL" },
          { id: pads.id, description: pads.description, calculatedTime: 0, jobType: "MECHANICAL" },
        ],
      },
      hourlyRatePence: RATE,
      commissionRate: COMMISSION,
    });
    expect(quote!.combineSource).toBe("haynespro");
    expect(quote!.combinedRawHours).toBe(1.1);
    expect(quote!.breakdown.totalPence).toBe(6600);
    expect(quote!.lines.map((l) => l.chargedHours)).toEqual([1.1, 0]);
    expect(quote!.lines.map((l) => l.linePence)).toEqual([6600, 0]);
  });

  it("falls back to the sum when the basket is incomplete", () => {
    const incomplete = buildRepairsQuote({
      items: [plain(pads), plain(rearPads)],
      combined: { totalRepairTime: 80, items: [{ id: pads.id, description: null, calculatedTime: 80, jobType: null }] },
      hourlyRatePence: RATE,
      commissionRate: COMMISSION,
    });
    expect(incomplete!.combineSource).toBe("sum");
    expect(incomplete!.lines.map((l) => l.chargedHours)).toEqual([0.8, 0.8]);
  });

  it("applies the one-hour minimum once to the whole booking", () => {
    const quote = buildRepairsQuote({
      items: [
        plain({ id: "a", description: "Check the brake system", rawHours: 0.4 }),
        plain({ id: "b", description: "Check the brake discs", rawHours: 0.3 }),
      ],
      combined: null,
      hourlyRatePence: RATE,
      commissionRate: COMMISSION,
    });
    expect(quote!.combinedRawHours).toBe(0.7);
    expect(quote!.billedHours).toBe(1);
    expect(quote!.breakdown.totalPence).toBe(6000);
    // Lines are informational and do not sum to the total here.
    expect(quote!.lines.reduce((n, l) => n + l.linePence, 0)).toBe(4200);
  });

  it("keeps a combined repair as one chosen item over several jobs", () => {
    const quote = buildRepairsQuote({
      items: [
        { id: "b:front", label: "Brake pads & discs · Front", nodes: [discs, pads] },
        plain(rearPads),
      ],
      combined: null,
      hourlyRatePence: RATE,
      commissionRate: COMMISSION,
    });
    expect(quote!.itemIds).toEqual(["b:front", rearPads.id]);
    expect(quote!.nodeIds).toEqual([discs.id, pads.id, rearPads.id]);
    expect(quote!.lines.map((l) => [l.itemId, l.itemLabel])).toEqual([
      ["b:front", "Brake pads & discs · Front"],
      ["b:front", "Brake pads & discs · Front"],
      [rearPads.id, null],
    ]);
    expect(quote!.description).toBe("Brake pads & discs · Front + 1 more job");
    expect(quote!.combinedRawHours).toBe(2.7);
    expect(quote!.items[0].nodeIds).toEqual([discs.id, pads.id]);
  });

  it("charges a job once when two items both include it", () => {
    const quote = buildRepairsQuote({
      items: [
        { id: "b:front", label: "Brake pads & discs · Front", nodes: [discs, pads] },
        plain(pads),
      ],
      combined: null,
      hourlyRatePence: RATE,
      commissionRate: COMMISSION,
    });
    expect(quote!.nodeIds).toEqual([discs.id, pads.id]);
    expect(quote!.combinedRawHours).toBe(1.9);
  });

  it("returns null with nothing to price", () => {
    expect(buildRepairsQuote({ items: [], combined: null, hourlyRatePence: RATE, commissionRate: COMMISSION })).toBeNull();
  });
});
