import { describe, expect, it } from "vitest";
import {
  approvedExtras,
  repairIdsFromLines,
  snapshotFromBooking,
  snapshotFromQuote,
  type RevisionPart,
  type RevisionSnapshot,
} from "./snapshot";
import { customerDirectionSentence, diffRevision, differenceLabel, followOnLinesFromRevision, hasChanges, packDiff } from "./diff";
import { feePayout, onSiteFeeFor, onSiteFeeOptions } from "./fees";
import { REVISION_EXPIRY_HOURS, isRevisionExpired, revisionExpiry, revisionRefusal } from "./status";
import type { RepairsQuote } from "@/lib/haynespro/repair-booking";
import type { QuoteView } from "@/lib/quotes/load";

const RATE = 6000;
const COMMISSION = 0.15;

function quoteFixture(over: Partial<RepairsQuote> = {}): RepairsQuote {
  // A wheel bearing (1.1 h) — what the mechanic found instead of the pads.
  const base = Math.round(1.1 * RATE);
  return {
    itemIds: ["bearing"],
    items: [],
    nodeIds: ["bearing"],
    lines: [{ nodeId: "bearing", description: "Renew the front wheel bearing", rawHours: 1.1, chargedHours: 1.1, linePence: base, itemId: "bearing", itemLabel: null, kind: "job" }],
    description: "Renew the front wheel bearing",
    combinedRawHours: 1.1,
    billedHours: 1.1,
    combineSource: null,
    breakdown: {
      areaId: null,
      basePence: base,
      durationHours: 1.1,
      hourlyRatePence: RATE,
      partsPence: 0,
      totalPence: base,
      commissionRate: COMMISSION,
      platformFeePence: Math.round(base * COMMISSION),
      mechanicPayoutPence: base - Math.round(base * COMMISSION),
      durationSource: "vehicle",
      vehicleRawDurationHours: 1.1,
    },
    products: [],
    labourPence: base,
    fixedPence: 0,
    oil: null,
    visitHours: 1.1,
    ...over,
  };
}

const BOOKING = {
  repair_node_id: "pads",
  repair_description: "Renew the front brake pads",
  service_duration_hours: 1,
  vehicle_raw_duration_hours: 0.8,
  combine_source: null,
  engine_oil_litres: null,
  engine_oil_price_per_litre_pence: null,
  engine_oil_source: null,
  hourly_rate_pence: RATE,
  commission_rate: COMMISSION,
  base_price_pence: 6000,
  parts_price_pence: 3200,
  total_pence: 9200,
  platform_fee_pence: 1380,
  mechanic_payout_pence: 7820,
};

const PADS_PART: RevisionPart = { id: "bp1", partId: "cat-pads", name: "Front brake pads", quantity: 1, unitPence: 3200, linePence: 3200, sourcing: "self" };

describe("snapshotFromBooking", () => {
  it("synthesises a single-job booking from its own columns", () => {
    const s = snapshotFromBooking(BOOKING, null, [{ id: "bp1", part_id: "cat-pads", part_name: "Front brake pads", quantity: 1, unit_price_pence: 3200, total_pence: 3200, sourcing: "self" }]);
    expect(s.repairIds).toEqual(["pads"]);
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]).toMatchObject({ nodeId: "pads", chargedHours: 1, linePence: 6000, kind: "job" });
    expect(s.parts).toEqual([PADS_PART]);
    expect(s.totalPence).toBe(9200);
    expect(s.basePricePence).toBe(6000);
    expect(s.partsPricePence).toBe(3200);
  });

  it("names a combined repair once, by its option id", () => {
    const rows = [
      { position: 0, node_id: "discs", description: "Renew the front discs", raw_hours: 1.2, charged_hours: 1.2, line_pence: 7200, item_id: "b:1", item_label: "Brake pads & discs · Front" },
      { position: 1, node_id: "pads", description: "Renew the front pads", raw_hours: 0.8, charged_hours: 0, line_pence: 0, item_id: "b:1", item_label: "Brake pads & discs · Front" },
      { position: 2, node_id: "bulb", description: "Renew a bulb", raw_hours: 0.2, charged_hours: 0.2, line_pence: 1200 },
    ];
    const s = snapshotFromBooking({ ...BOOKING, repair_description: "Brake pads & discs · Front + 1 more job" }, rows, []);
    expect(s.repairIds).toEqual(["b:1", "bulb"]);
    expect(repairIdsFromLines(s.lines)).toEqual(["b:1", "bulb"]);
  });

  it("takes approved extra work off the figures so the snapshot describes the job alone", () => {
    const quotes = [
      { id: "q1", kind: "now", status: "approved", totalPence: 1500, labourPence: 1500, partsPence: 0, platformFeePence: 225, mechanicPayoutPence: 1275 },
      { id: "q2", kind: "now", status: "declined", totalPence: 9999, labourPence: 9999, partsPence: 0, platformFeePence: 1, mechanicPayoutPence: 1 },
      { id: "hold", kind: "now", status: "approved", totalPence: 500, labourPence: 500, partsPence: 0, platformFeePence: 75, mechanicPayoutPence: 425 },
    ] as unknown as QuoteView[];
    const extras = approvedExtras(quotes, new Set(["hold"]));
    expect(extras.totalPence).toBe(1500);
    const s = snapshotFromBooking({ ...BOOKING, total_pence: 10700, base_price_pence: 7500, platform_fee_pence: 1605, mechanic_payout_pence: 9095 }, null, [], extras);
    expect(s.totalPence).toBe(9200);
    expect(s.basePricePence).toBe(6000);
  });
});

describe("snapshotFromQuote", () => {
  it("prices parts on top of the quote and splits commission on the whole", () => {
    const bearing: RevisionPart = { id: null, partId: null, name: "Wheel bearing kit", quantity: 1, unitPence: 4500, linePence: 4500, sourcing: "self" };
    const s = snapshotFromQuote(quoteFixture(), [bearing]);
    expect(s.basePricePence).toBe(6600);
    expect(s.partsPricePence).toBe(4500);
    expect(s.totalPence).toBe(11100);
    expect(s.platformFeePence).toBe(Math.round(11100 * COMMISSION));
    expect(s.mechanicPayoutPence).toBe(11100 - Math.round(11100 * COMMISSION));
    expect(s.repairIds).toEqual(["bearing"]);
  });

  it("is bit-identical to the quote's own breakdown when there are no parts", () => {
    const q = quoteFixture();
    const s = snapshotFromQuote(q, []);
    expect(s.totalPence).toBe(q.breakdown.totalPence);
    expect(s.platformFeePence).toBe(q.breakdown.platformFeePence);
    expect(s.mechanicPayoutPence).toBe(q.breakdown.mechanicPayoutPence);
  });

  it("keeps BMT-sourced parts off the payout, as the parts action does", () => {
    const bmt: RevisionPart = { id: "bp9", partId: "cat-x", name: "Sensor", quantity: 1, unitPence: 2000, linePence: 2000, sourcing: "bmt" };
    const s = snapshotFromQuote(quoteFixture(), [bmt]);
    const total = 6600 + 2000;
    expect(s.mechanicPayoutPence).toBe(total - Math.round(total * COMMISSION) - 2000);
  });
});

describe("diffRevision", () => {
  const before = snapshotFromBooking(BOOKING, null, [{ id: "bp1", part_id: "cat-pads", part_name: "Front brake pads", quantity: 1, unit_price_pence: 3200, total_pence: 3200, sourcing: "self" }]);
  const after = snapshotFromQuote(quoteFixture(), [{ id: null, partId: null, name: "Wheel bearing kit", quantity: 1, unitPence: 4500, linePence: 4500, sourcing: "self" }]);
  const diff = diffRevision(before, after);

  it("finds what was swapped, and which way the money went", () => {
    expect(diff.lines.removed.map((l) => l.nodeId)).toEqual(["pads"]);
    expect(diff.lines.added.map((l) => l.nodeId)).toEqual(["bearing"]);
    expect(diff.parts.removed.map((p) => p.name)).toEqual(["Front brake pads"]);
    expect(diff.parts.added.map((p) => p.name)).toEqual(["Wheel bearing kit"]);
    expect(diff.differencePence).toBe(11100 - 9200);
    expect(diff.direction).toBe("more");
    expect(hasChanges(diff)).toBe(true);
    expect(differenceLabel(diff.differencePence)).toBe("+£19");
  });

  it("the hold-quote invariant: after − difference is exactly before", () => {
    expect(after.totalPence - diff.differencePence).toBe(before.totalPence);
  });

  it("a cheaper swap needs no card and says so", () => {
    const cheaper = snapshotFromQuote(quoteFixture({ lines: [{ nodeId: "bulb", description: "Renew a bulb", rawHours: 0.2, chargedHours: 0.2, linePence: 1200, itemId: "bulb", itemLabel: null, kind: "job" }], breakdown: { ...quoteFixture().breakdown, basePence: 6000, totalPence: 6000, durationHours: 1 } }), []);
    const d = diffRevision(before, cheaper);
    expect(d.direction).toBe("less");
    expect(d.differencePence).toBe(-3200);
    expect(customerDirectionSentence(d.differencePence)).toMatch(/£32 less/);
    expect(customerDirectionSentence(d.differencePence)).toMatch(/released/);
  });

  it("keeps an existing part by its row id, and treats a same-named new one as added", () => {
    const keptPart = snapshotFromQuote(quoteFixture(), [PADS_PART]);
    const d = diffRevision(before, keptPart);
    expect(d.parts.kept).toHaveLength(1);
    expect(d.parts.added).toHaveLength(0);
    const renamed = snapshotFromQuote(quoteFixture(), [{ ...PADS_PART, id: null }]);
    expect(diffRevision(before, renamed).parts.added).toHaveLength(1);
  });

  it("packs the lists for the email and derives the follow-on lines (Task 38)", () => {
    const packed = packDiff(diff);
    expect(packed.removed).toBe("Renew the front brake pads · 1 h|Front brake pads · £32");
    expect(packed.added).toMatch(/^Renew the front wheel bearing · 1.1 h\|Wheel bearing kit · £45$/);
    const follow = followOnLinesFromRevision(diff);
    expect(follow).toEqual([
      { kind: "labour", description: "Renew the front brake pads", hours: 1, quantity: 1, unitPence: null, nodeId: "pads", partId: null },
      { kind: "part", description: "Front brake pads", hours: null, quantity: 1, unitPence: 3200, nodeId: null, partId: "cat-pads" },
    ]);
  });
});

describe("fees", () => {
  it("offers the three ways to end the job, priced from the live settings", () => {
    const opts = onSiteFeeOptions({ diagnosticPence: 5999, enRoutePence: 5000 });
    expect(opts.map((o) => [o.kind, o.pence])).toEqual([
      ["diagnostic", 5999],
      ["cancellation", 5000],
      ["none", 0],
    ]);
    expect(onSiteFeeFor("diagnostic", { diagnosticPence: 5999, enRoutePence: 5000 })).toBe(5999);
    expect(feePayout(5999, 0.15)).toEqual({ platformFeePence: 900, mechanicPayoutPence: 5099 });
  });
});

describe("status", () => {
  const now = new Date("2026-09-09T12:00:00Z");
  it("lapses a sent revision after a day, never an answered one", () => {
    expect(revisionExpiry(now).getTime() - now.getTime()).toBe(REVISION_EXPIRY_HOURS * 3_600_000);
    expect(isRevisionExpired({ status: "sent", expires_at: "2026-09-09T11:59:00Z" }, now)).toBe(true);
    expect(isRevisionExpired({ status: "approved", expires_at: "2026-09-01T00:00:00Z" }, now)).toBe(false);
  });
  it("tells the customer why they can't answer", () => {
    const open = { status: "sent", expires_at: "2026-09-10T00:00:00Z" };
    expect(revisionRefusal(open, "in_progress", now)).toBeNull();
    expect(revisionRefusal(open, "completed", now)).toMatch(/no longer in progress/);
    expect(revisionRefusal({ ...open, status: "declined" }, "in_progress", now)).toMatch(/no longer open/);
    expect(revisionRefusal({ ...open, expires_at: "2026-09-01T00:00:00Z" }, "in_progress", now)).toMatch(/expired/);
  });
});

// Type guard so a snapshot edit that drops a money field fails here, not in production.
const _shape: RevisionSnapshot = snapshotFromQuote(quoteFixture(), []);
void _shape;
