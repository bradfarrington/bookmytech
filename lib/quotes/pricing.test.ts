import { describe, expect, it } from "vitest";
import { MAX_QUOTE_PENCE, priceReduction, safePriceQuoteLines, splitCommission } from "./pricing";
import { QUOTE_EXPIRY_DAYS, isQuoteExpired, quoteExpiry, respondRefusal } from "./status";

const SETTINGS = { hourlyRatePence: 6000, commissionRate: 0.15 };

describe("priceQuoteLines", () => {
  it("prices labour at the platform rate and parts at quantity × unit, then splits commission", () => {
    const res = safePriceQuoteLines(
      [
        { kind: "labour", description: "Renew the rear brake pads", hours: 0.8, nodeId: "1M01534000WV0" },
        { kind: "part", description: "Rear brake pads", quantity: 1, unitPence: 3200, partId: "p1" },
        { kind: "other", description: "Brake cleaner", quantity: 2, unitPence: 350 },
      ],
      SETTINGS,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.totals.lines.map((l) => l.linePence)).toEqual([4800, 3200, 700]);
    expect(res.totals.labourPence).toBe(5500); // labour + other
    expect(res.totals.partsPence).toBe(3200);
    expect(res.totals.totalPence).toBe(8700);
    expect(res.totals.platformFeePence).toBe(1305);
    expect(res.totals.mechanicPayoutPence).toBe(7395);
    expect(res.totals.lines[0]).toMatchObject({ unitPence: 6000, quantity: 1, hours: 0.8, nodeId: "1M01534000WV0" });
    expect(res.totals.lines[1]).toMatchObject({ partId: "p1", hours: null });
  });

  it("refuses an empty quote, a £0 quote, silly hours, missing descriptions and absurd totals", () => {
    expect(safePriceQuoteLines([], SETTINGS)).toEqual({ ok: false, error: "Add at least one line to the quote." });
    expect(safePriceQuoteLines([{ kind: "part", description: "Bolt", quantity: 1, unitPence: 0 }], SETTINGS).ok).toBe(false);
    expect(safePriceQuoteLines([{ kind: "labour", description: "x", hours: 0 }], SETTINGS).ok).toBe(false);
    expect(safePriceQuoteLines([{ kind: "labour", description: "x", hours: 30 }], SETTINGS).ok).toBe(false);
    expect(safePriceQuoteLines([{ kind: "labour", description: "  ", hours: 1 }], SETTINGS).ok).toBe(false);
    expect(safePriceQuoteLines([{ kind: "part", description: "Engine", quantity: 1, unitPence: MAX_QUOTE_PENCE + 1 }], SETTINGS).ok).toBe(false);
    expect(safePriceQuoteLines([{ kind: "part", description: "x", quantity: 0, unitPence: 100 }], SETTINGS).ok).toBe(false);
  });

  it("rounds labour to the penny and hours to two places", () => {
    const res = safePriceQuoteLines([{ kind: "labour", description: "Diagnose", hours: 0.333 }], SETTINGS);
    expect(res.ok && res.totals.lines[0].hours).toBe(0.33);
    expect(res.ok && res.totals.totalPence).toBe(1980);
  });
});

describe("priceReduction + splitCommission", () => {
  it("is the same split, negative, and clamped to what was held", () => {
    expect(splitCommission(10000, 0.15)).toEqual({ platformFeePence: 1500, mechanicPayoutPence: 8500 });
    expect(priceReduction(1000, { commissionRate: 0.15, maxPence: 5000 })).toEqual({
      ok: true,
      totalPence: -1000,
      platformFeePence: -150,
      mechanicPayoutPence: -850,
    });
    expect(priceReduction(6000, { commissionRate: 0.15, maxPence: 5000 }).ok).toBe(false);
    expect(priceReduction(0, { commissionRate: 0.15, maxPence: 5000 }).ok).toBe(false);
  });
});

describe("quote status", () => {
  const now = new Date("2026-09-08T12:00:00Z");
  it("expires a sent quote after the window, never an answered one", () => {
    expect(quoteExpiry(now).getTime() - now.getTime()).toBe(QUOTE_EXPIRY_DAYS * 86_400_000);
    expect(isQuoteExpired({ status: "sent", expires_at: "2026-09-08T11:59:00Z" }, now)).toBe(true);
    expect(isQuoteExpired({ status: "sent", expires_at: "2026-09-09T00:00:00Z" }, now)).toBe(false);
    expect(isQuoteExpired({ status: "approved", expires_at: "2026-09-01T00:00:00Z" }, now)).toBe(false);
  });

  it("tells the customer why they can't answer", () => {
    const open = { kind: "now", status: "sent", expires_at: "2026-09-10T00:00:00Z" };
    expect(respondRefusal(open, "in_progress", now)).toBeNull();
    expect(respondRefusal(open, "completed", now)).toMatch(/no longer in progress/);
    expect(respondRefusal({ ...open, status: "declined" }, "in_progress", now)).toMatch(/no longer open/);
    expect(respondRefusal({ ...open, expires_at: "2026-09-01T00:00:00Z" }, "in_progress", now)).toMatch(/expired/);
    expect(respondRefusal({ ...open, kind: "follow_on" }, "completed", now)).toBeNull();
  });
});
