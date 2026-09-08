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

// --- Products (Task 31) -------------------------------------------------------

const diagnostic = {
  id: "p:d1",
  name: "Plug-in diagnostic",
  pricePence: 5999,
  labourHours: null,
  durationHours: 1,
  includesEngineOil: false,
  category: "diagnostics" as const,
  summary: null,
  description: null,
};
const fullService = {
  id: "p:s1",
  name: "Full service",
  pricePence: 14900,
  labourHours: null,
  durationHours: 2.5,
  includesEngineOil: true,
  category: "servicing" as const,
  summary: null,
  description: null,
};
const hourlyService = { ...fullService, id: "p:s2", name: "Interim service", pricePence: null, labourHours: 0.75 };
const oil = { litres: 4.3, pencePerLitre: 1500, pence: 6450, source: "haynespro" as const, label: "Engine sump, including filter" };

describe("buildRepairsQuote with products", () => {
  it("prices a fixed product alone at its price — no 1-hour minimum, no hourly work", () => {
    const quote = buildRepairsQuote({ items: [], products: [diagnostic], combined: null, hourlyRatePence: RATE, commissionRate: COMMISSION });
    expect(quote).not.toBeNull();
    expect(quote!.breakdown.totalPence).toBe(5999);
    expect(quote!.breakdown.basePence).toBe(5999);
    expect(quote!.breakdown.partsPence).toBe(0);
    expect(quote!.billedHours).toBe(0);
    expect(quote!.combinedRawHours).toBe(0);
    expect(quote!.visitHours).toBe(1);
    expect(quote!.breakdown.durationHours).toBe(1);
    expect(quote!.nodeIds).toEqual([]);
    expect(quote!.itemIds).toEqual(["p:d1"]);
    expect(quote!.description).toBe("Plug-in diagnostic");
    expect(quote!.lines).toEqual([
      { nodeId: "p:d1", description: "Plug-in diagnostic", rawHours: 0, chargedHours: 0, linePence: 5999, itemId: "p:d1", itemLabel: null, kind: "product", productId: "d1" },
    ]);
    expect(quote!.oil).toBeNull();
    expect(quote!.breakdown.platformFeePence).toBe(900);
  });

  it("adds engine oil to a servicing product as the parts line", () => {
    const quote = buildRepairsQuote({ items: [], products: [fullService], oil, combined: null, hourlyRatePence: RATE, commissionRate: COMMISSION });
    expect(quote!.breakdown.basePence).toBe(14900);
    expect(quote!.breakdown.partsPence).toBe(6450);
    expect(quote!.breakdown.totalPence).toBe(21350);
    expect(quote!.oil).toEqual(oil);
    expect(quote!.visitHours).toBe(2.5);
  });

  it("ignores the oil line when no product includes oil", () => {
    const quote = buildRepairsQuote({ items: [], products: [diagnostic], oil, combined: null, hourlyRatePence: RATE, commissionRate: COMMISSION });
    expect(quote!.breakdown.partsPence).toBe(0);
    expect(quote!.oil).toBeNull();
  });

  it("mixes a short job with a fixed product: 1h minimum on the job, product at its price, visit = both", () => {
    const short = { id: "a", description: "Check the brake system", rawHours: 0.7 };
    const quote = buildRepairsQuote({
      items: [plain(short)],
      products: [diagnostic],
      order: ["p:d1", "a"],
      combined: null,
      hourlyRatePence: RATE,
      commissionRate: COMMISSION,
    });
    expect(quote!.billedHours).toBe(1);
    expect(quote!.labourPence).toBe(6000);
    expect(quote!.fixedPence).toBe(5999);
    expect(quote!.breakdown.totalPence).toBe(11999);
    expect(quote!.visitHours).toBe(2);
    // The customer's order is kept: product first, then the job.
    expect(quote!.lines.map((l) => l.nodeId)).toEqual(["p:d1", "a"]);
    expect(quote!.itemIds).toEqual(["p:d1", "a"]);
    expect(quote!.description).toBe("Plug-in diagnostic + 1 more job");
    expect(quote!.combineSource).toBeNull();
  });

  it("an hourly product and a job share one 1-hour minimum", () => {
    const short = { id: "a", description: "Check the brake system", rawHours: 0.5 };
    const quote = buildRepairsQuote({ items: [plain(short)], products: [hourlyService], oil, combined: null, hourlyRatePence: RATE, commissionRate: COMMISSION });
    expect(quote!.combinedRawHours).toBe(1.25);
    expect(quote!.billedHours).toBe(1.25);
    expect(quote!.labourPence).toBe(7500);
    expect(quote!.breakdown.partsPence).toBe(6450);
    expect(quote!.breakdown.totalPence).toBe(13950);
    expect(quote!.visitHours).toBe(1.25);
    expect(quote!.lines.find((l) => l.kind === "product")).toMatchObject({ rawHours: 0.75, chargedHours: 0.75, linePence: 4500 });
  });

  it("with no products is bit-for-bit the pre-Task-31 quote", () => {
    const before = buildRepairsQuote({ items: [plain(discs), plain(pads)], combined: null, hourlyRatePence: RATE, commissionRate: COMMISSION });
    const after = buildRepairsQuote({ items: [plain(discs), plain(pads)], products: [], oil, combined: null, hourlyRatePence: RATE, commissionRate: COMMISSION });
    expect(after!.breakdown).toEqual(before!.breakdown);
    expect(after!.lines).toEqual(before!.lines);
    expect(after!.description).toBe(before!.description);
    expect(after!.products).toEqual([]);
    expect(after!.oil).toBeNull();
    expect(after!.visitHours).toBe(before!.billedHours);
  });
});
