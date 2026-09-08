import { describe, expect, it } from "vitest";
import { buildFollowOnQuote, followOnRefusal } from "./follow-on";
import type { QuoteView } from "./load";

const base: QuoteView = {
  id: "q1",
  bookingId: "b1",
  mechanicId: "m1",
  kind: "follow_on",
  status: "sent",
  title: "Rear brakes",
  note: null,
  hourlyRatePence: 6000,
  commissionRate: 0.15,
  labourPence: 5500,
  partsPence: 3200,
  totalPence: 8700,
  platformFeePence: 1305,
  mechanicPayoutPence: 7395,
  stripePaymentIntentId: null,
  stripeChargeId: null,
  sentAt: "2026-09-08T10:00:00Z",
  respondedAt: null,
  expiresAt: "2099-01-01T00:00:00Z",
  capturedAt: null,
  followOnBookingId: null,
  createdAt: "2026-09-08T10:00:00Z",
  lines: [
    { id: "l1", position: 0, kind: "labour", description: "Renew the rear brake pads", hours: 0.8, quantity: 1, unitPence: 6000, linePence: 4800, nodeId: "1M01534000WV0", partId: null, faultId: null },
    { id: "l2", position: 1, kind: "part", description: "Rear brake pads", hours: null, quantity: 1, unitPence: 3200, linePence: 3200, nodeId: null, partId: "p1", faultId: null },
    { id: "l3", position: 2, kind: "other", description: "Brake cleaner", hours: null, quantity: 2, unitPence: 350, linePence: 700, nodeId: null, partId: null, faultId: null },
  ],
};

describe("buildFollowOnQuote", () => {
  it("prices the booking at exactly the quote's figures, with the 1h visit minimum", () => {
    const q = buildFollowOnQuote(base)!;
    expect(q.breakdown.totalPence).toBe(8700);
    expect(q.breakdown.basePence).toBe(5500);
    expect(q.breakdown.partsPence).toBe(3200);
    expect(q.breakdown.platformFeePence).toBe(1305);
    expect(q.breakdown.mechanicPayoutPence).toBe(7395);
    expect(q.combinedRawHours).toBe(0.8);
    expect(q.billedHours).toBe(1);
    expect(q.visitHours).toBe(1);
    expect(q.description).toBe("Rear brakes");
  });

  it("turns labour into job lines (HaynesPro id kept) and 'other' into a fixed line; parts are not lines", () => {
    const q = buildFollowOnQuote(base)!;
    expect(q.lines.map((l) => [l.nodeId, l.kind ?? "job", l.linePence])).toEqual([
      ["1M01534000WV0", "job", 4800],
      ["q:l3", "product", 700],
    ]);
    expect(q.nodeIds).toEqual(["1M01534000WV0"]);
    expect(q.itemIds).toEqual(["1M01534000WV0", "q:l3"]);
  });

  it("names a parts-only quote by its title and refuses the wrong kind", () => {
    const partsOnly = { ...base, title: null, labourPence: 0, totalPence: 3200, lines: [base.lines[1]] };
    const q = buildFollowOnQuote(partsOnly)!;
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0].nodeId).toBe("q:q1");
    expect(q.description).toBe("Follow-on work");
    expect(buildFollowOnQuote({ ...base, kind: "now" })).toBeNull();
    expect(buildFollowOnQuote({ ...base, lines: [] })).toBeNull();
  });
});

describe("followOnRefusal", () => {
  it("allows open or approved, refuses booked, closed, expired or the wrong kind", () => {
    expect(followOnRefusal(base)).toBeNull();
    expect(followOnRefusal({ ...base, status: "approved" })).toBeNull();
    expect(followOnRefusal({ ...base, followOnBookingId: "b2" })).toMatch(/already booked/);
    expect(followOnRefusal({ ...base, status: "declined" })).toMatch(/no longer open/);
    expect(followOnRefusal({ ...base, expiresAt: "2020-01-01T00:00:00Z" })).toMatch(/expired/);
    expect(followOnRefusal({ ...base, kind: "now" })).toMatch(/isn't for a return visit/);
  });
});
