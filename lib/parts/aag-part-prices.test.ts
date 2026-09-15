import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  AAG_PRICE_FRESH_MS,
  AAG_PRICE_LAST_KNOWN_MS,
  freshAnswer,
  loadAagPartOffers,
  settleAagPartOffers,
  type AagPartPriceRow,
} from "./aag-part-prices";
import type { SupplierOffer } from "./supplier-offer";

const NOW = Date.parse("2026-09-15T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

const filter: SupplierOffer = {
  supplier: "aag",
  partNumber: "WIX-FILTER",
  description: "AIR FILTER",
  brand: "WIX",
  tier: "Best",
  costPence: 2910,
  surchargePence: null,
  availability: [],
  totalQty: null,
  fitment: [],
  quantityOfFit: 1,
  position: null,
  imageUrl: null,
  notes: [],
  buyable: true,
};

const row = (over: Partial<AagPartPriceRow> = {}): AagPartPriceRow => ({
  reg: "S28BSW",
  genart_id: 8,
  state: "ok",
  offers: [filter],
  fetched_at: ago(HOUR),
  ...over,
});

const at = { reg: "S28BSW", genartId: 8, now: NOW };

describe("freshAnswer", () => {
  it("uses an answer under 12 hours old as it is", () => {
    expect(freshAnswer(row(), NOW)).toEqual({ state: "ok", offers: [filter], pricedAt: ago(HOUR), lastKnown: false });
    expect(freshAnswer(row({ state: "empty", offers: [] }), NOW)).toEqual({ state: "empty", pricedAt: ago(HOUR) });
  });

  it("asks again once it is 12 hours old", () => {
    expect(freshAnswer(row({ fetched_at: ago(AAG_PRICE_FRESH_MS) }), NOW)).toBeNull();
    expect(freshAnswer(null, NOW)).toBeNull();
  });
});

describe("settleAagPartOffers", () => {
  it("stores and uses what AAG says", () => {
    const settled = settleAagPartOffers(null, { kind: "ok", offers: [filter] }, at);
    expect(settled.result).toEqual({ state: "ok", offers: [filter], pricedAt: ago(0), lastKnown: false });
    expect(settled.write).toEqual({ reg: "S28BSW", genart_id: 8, state: "ok", offers: [filter], fetched_at: ago(0) });
  });

  it("uses the last known price when AAG can't answer, up to 7 days old", () => {
    const settled = settleAagPartOffers(row({ fetched_at: ago(6 * DAY) }), { kind: "failed" }, at);
    expect(settled.result).toEqual({ state: "ok", offers: [filter], pricedAt: ago(6 * DAY), lastKnown: true });
    expect(settled.write).toBeNull();
    expect(settleAagPartOffers(row({ fetched_at: ago(AAG_PRICE_LAST_KNOWN_MS) }), { kind: "failed" }, at).result.state).toBe("ok");
  });

  it("can't price once the last answer is over 7 days old", () => {
    expect(settleAagPartOffers(row({ fetched_at: ago(8 * DAY) }), { kind: "failed" }, at)).toEqual({
      result: { state: "unavailable" },
      write: null,
    });
    expect(settleAagPartOffers(null, { kind: "failed" }, at).result).toEqual({ state: "unavailable" });
  });

  it("keeps a recent price when AAG suddenly lists no parts", () => {
    const settled = settleAagPartOffers(row({ fetched_at: ago(2 * DAY) }), { kind: "no_parts" }, at);
    expect(settled.result).toMatchObject({ state: "ok", lastKnown: true });
    expect(settled.write).toBeNull();
  });

  it("records 'no parts' when there is nothing recent to fall back on", () => {
    const settled = settleAagPartOffers(null, { kind: "no_parts" }, at);
    expect(settled.result).toEqual({ state: "empty", pricedAt: ago(0) });
    expect(settled.write).toMatchObject({ state: "empty", offers: [] });
  });
});

describe("loadAagPartOffers", () => {
  function fakeDb(rows: AagPartPriceRow[], writes: unknown[], error: { code: string } | null = null): SupabaseClient {
    return {
      from: () => ({
        select: () => ({ eq: () => ({ in: async () => ({ data: error ? null : rows, error }) }) }),
        upsert: async (values: unknown) => {
          writes.push(values);
          return { error: null };
        },
      }),
    } as unknown as SupabaseClient;
  }

  it("asks AAG only for groups without a fresh answer, and stores what it says", async () => {
    const writes: unknown[] = [];
    const asked: Array<[string, number]> = [];
    const load = await loadAagPartOffers(fakeDb([row()], writes), "S28 BSW", [8, 82], {
      now: NOW,
      fetch: async (regKey, genartId) => {
        asked.push([regKey, genartId]);
        return { kind: "ok", offers: [filter] };
      },
    });
    expect(asked).toEqual([["S28BSW", 82]]);
    expect(load.enabled && [...load.byGenart.keys()].sort()).toEqual([8, 82]);
    expect(writes).toEqual([[{ reg: "S28BSW", genart_id: 82, state: "ok", offers: [filter], fetched_at: ago(0) }]]);
  });

  it("switches itself off while migration 0070 is missing", async () => {
    const load = await loadAagPartOffers(fakeDb([], [], { code: "PGRST205" }), "S28BSW", [8], {
      now: NOW,
      fetch: async () => ({ kind: "failed" }),
    });
    expect(load).toEqual({ enabled: false });
  });
});
