import { describe, expect, it } from "vitest";

import type { AagQuoteClassicOutcome, AagQuoteOutcome } from "@/lib/aag/client";
import type { AagProductInfo } from "@/lib/aag/types";
import { fetchAagLiveOffers, type AagLookups } from "./aag-live-offers";
import { AAG_PRICE_LAST_KNOWN_MS } from "./aag-part-prices";
import {
  loadModelPartOffers,
  loadProductPrices,
  modelPartOffer,
  settleProductPrice,
  type ModelPartChoiceRow,
  type ProductPriceRow,
} from "./model-parts";
import { partGapRows } from "./part-gaps";
import { priceJobParts } from "./quote-parts";

// NAPA's /api/product/info for a front disc, live 2026-11-17 (same price as the car lookup).
const DISC: AagProductInfo = {
  ProductId: "NPANBD5431",
  ProductDescription: "NAPA BRAKE DISC 258 * 4 (VENTED) -  FRONT",
  Brand: "NAPA",
  BrandRating: "Better",
  CustomerProductGroup: ["82"],
  CustomerLockoutRating: "OK FOR SUPPLY",
  RecMinOrdQty: 2,
  CostPrice: 31.85,
  Surcharge: 0,
};

const choice = (over: Partial<ModelPartChoiceRow> = {}): ModelPartChoiceRow => ({
  id: "c1",
  make_name: "FORD",
  model_label: "FORD Ranger",
  genart_id: 82,
  position: "front",
  product_id: "NPANBD5431",
  label: "Brake disc",
  brand: "NAPA",
  description: "NAPA BRAKE DISC",
  chosen_at: "2026-11-17T10:00:00.000Z",
  ...over,
});

const NOW = Date.parse("2026-11-18T12:00:00.000Z");

describe("modelPartOffer", () => {
  it("prices a picked part at NAPA's live price, on the picked axle", () => {
    expect(modelPartOffer(choice(), DISC)).toMatchObject({
      supplier: "aag",
      partNumber: "NPANBD5431",
      brand: "NAPA",
      tier: "Better",
      costPence: 3185,
      surchargePence: null,
      quantityOfFit: 2,
      position: "front",
      buyable: true,
      modelPart: true,
    });
  });

  it("isn't buyable when NAPA locks it out or gives no price", () => {
    expect(modelPartOffer(choice(), { ...DISC, CustomerLockoutRating: "LOCKED" }).buyable).toBe(false);
    expect(modelPartOffer(choice(), { ...DISC, CostPrice: null }).buyable).toBe(false);
  });
});

describe("settleProductPrice", () => {
  const at = { productId: "NPANBD5431", now: NOW };
  const old = (ageMs: number, state: "ok" | "missing" = "ok"): ProductPriceRow => ({
    product_id: "NPANBD5431",
    state,
    info: DISC,
    fetched_at: new Date(NOW - ageMs).toISOString(),
  });

  it("uses and stores NAPA's answer", () => {
    const settled = settleProductPrice(null, { found: DISC }, at);
    expect(settled.result).toMatchObject({ state: "ok", lastKnown: false });
    expect(settled.write).toMatchObject({ state: "ok", product_id: "NPANBD5431" });
  });

  it("records a part number NAPA doesn't know", () => {
    expect(settleProductPrice(old(1000), { found: null }, at)).toMatchObject({ result: { state: "missing" }, write: { state: "missing" } });
  });

  it("uses the last price for up to 7 days when NAPA can't answer", () => {
    expect(settleProductPrice(old(AAG_PRICE_LAST_KNOWN_MS - 1), undefined, at).result).toMatchObject({ state: "ok", lastKnown: true });
    expect(settleProductPrice(old(AAG_PRICE_LAST_KNOWN_MS + 1), undefined, at).result).toEqual({ state: "unavailable" });
    expect(settleProductPrice(null, undefined, at).result).toEqual({ state: "unavailable" });
  });
});

/** A Supabase stand-in with the two tables model parts read and write. */
function fakeDb(tables: { model_part_choices?: ModelPartChoiceRow[]; aag_product_prices?: ProductPriceRow[] }) {
  const upserts: unknown[] = [];
  const db = {
    from: (table: keyof typeof tables) => {
      const rows = () => (tables[table] ?? []) as unknown as Array<Record<string, unknown>>;
      const filters: Array<(r: Record<string, unknown>) => boolean> = [];
      const query = {
        select: () => query,
        eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), query),
        in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), query),
        then: (resolve: (v: unknown) => void) => resolve({ data: rows().filter((r) => filters.every((f) => f(r))), error: null }),
        upsert: async (written: unknown) => (upserts.push(written), { error: null }),
      };
      return query;
    },
  };
  return { db: db as never, upserts };
}

describe("loadProductPrices", () => {
  it("asks NAPA once for every stale part number and stores the answers", async () => {
    const asked: string[][] = [];
    const { db, upserts } = fakeDb({});
    const prices = await loadProductPrices(db, ["NPANBD5431", "GONE-1"], {
      now: NOW,
      fetch: async (ids) => (asked.push(ids), { Products: [DISC], ProductsNotFound: [{ ProductId: "GONE-1" }] }),
    });
    expect(asked).toEqual([["NPANBD5431", "GONE-1"]]);
    expect(prices.get("NPANBD5431")).toMatchObject({ state: "ok" });
    expect(prices.get("GONE-1")).toEqual({ state: "missing" });
    expect(upserts).toHaveLength(1);
  });

  it("uses a stored answer under 12 hours old without asking NAPA", async () => {
    const { db } = fakeDb({
      aag_product_prices: [{ product_id: "NPANBD5431", state: "ok", info: DISC, fetched_at: new Date(NOW - 60_000).toISOString() }],
    });
    let asked = false;
    const prices = await loadProductPrices(db, ["NPANBD5431"], { now: NOW, fetch: async () => ((asked = true), null) });
    expect(asked).toBe(false);
    expect(prices.get("NPANBD5431")).toMatchObject({ state: "ok", lastKnown: false });
  });
});

describe("loadModelPartOffers", () => {
  it("turns the model's picks into NAPA answers, one entry per part type", async () => {
    const { db } = fakeDb({
      model_part_choices: [choice(), choice({ id: "c2", position: "rear", product_id: "REAR-1" }), choice({ id: "c3", model_label: "FORD Ranger (TKE)" })],
    });
    const offers = await loadModelPartOffers(db, { make: "FORD", modelLabel: "FORD Ranger" }, [82], {
      now: NOW,
      fetch: async () => ({ Products: [DISC, { ...DISC, ProductId: "REAR-1", CostPrice: 20 }] }),
    });
    const disc = offers.get(82);
    expect(disc?.state).toBe("ok");
    if (disc?.state === "ok") expect(disc.offers.map((o) => [o.partNumber, o.position])).toEqual([["NPANBD5431", "front"], ["REAR-1", "rear"]]);
  });

  it("leaves a part type out when NAPA can't price its pick, so estimates still apply", async () => {
    const { db } = fakeDb({ model_part_choices: [choice()] });
    const offers = await loadModelPartOffers(db, { make: "FORD", modelLabel: "FORD Ranger" }, [82], { now: NOW, fetch: async () => null });
    expect(offers.size).toBe(0);
  });
});

describe("a picked part in a quote", () => {
  it("prices the job from the pick, marked as chosen for the model", async () => {
    const { db } = fakeDb({ model_part_choices: [choice()] });
    const picked = await loadModelPartOffers(db, { make: "FORD", modelLabel: "FORD Ranger" }, [82], { now: NOW, fetch: async () => ({ Products: [DISC] }) });
    const result = priceJobParts({
      jobs: [{ nodeId: "n1", description: "Renew the front brake discs", groups: [{ genartId: 82, label: "Brake disc" }] }],
      offers: picked,
    });
    expect(result.ok).toBe(true);
    expect(result.parts[0]).toMatchObject({ partNumber: "NPANBD5431", source: "chosen", modelPart: true, linePence: 6370 });
  });
});

describe("fetchAagLiveOffers with an approved code mapping (Task 77)", () => {
  const byCode = (answers: Record<string, AagQuoteOutcome>): AagLookups => ({
    quote: async (_reg, genart) => answers[String(genart)] ?? { kind: "no_parts" },
    classic: async () => ({ kind: "no_parts" }) as AagQuoteClassicOutcome,
  });
  const FLUID: AagQuoteOutcome = {
    kind: "ok",
    body: { Articles: [{ ArticleDescription: "BRAKE FLUID DOT4 1L", ProductOptions: [{ ProductId: "FLUID-1", CostPrice: 6.5 }] }] },
  };

  it("prices brake fluid under NAPA's code when HaynesPro's has nothing, and records the code", async () => {
    const result = await fetchAagLiveOffers("S28BSW", 71, { napaGenart: 3357 }, byCode({ "3357": FLUID }));
    expect(result).toMatchObject({ kind: "ok" });
    if (result.kind === "ok") expect(result.offers[0]).toMatchObject({ partNumber: "FLUID-1", napaGenart: 3357 });
  });

  it("keeps HaynesPro's own code when it has parts", async () => {
    const own: AagQuoteOutcome = {
      kind: "ok",
      body: { Articles: [{ ArticleDescription: "OWN", ProductOptions: [{ ProductId: "OWN-1", CostPrice: 5 }] }] },
    };
    const result = await fetchAagLiveOffers("S28BSW", 71, { napaGenart: 3357 }, byCode({ "71": own, "3357": FLUID }));
    if (result.kind === "ok") expect(result.offers.map((o) => [o.partNumber, o.napaGenart])).toEqual([["OWN-1", undefined]]);
  });

  it("is 'no parts' when neither code has any", async () => {
    expect(await fetchAagLiveOffers("S28BSW", 71, { napaGenart: 3357 }, byCode({}))).toEqual({ kind: "no_parts" });
  });
});

describe("partGapRows", () => {
  it("records each part type once, with the first repair that needed it", () => {
    const rows = partGapRows(
      { make: "FORD", modelLabel: "FORD Ranger" },
      "s28 bsw",
      [
        { genartId: 107, label: "Bulb, headlight", sampleRepair: "Renew the left headlight bulb" },
        { genartId: 107, label: "Bulb, headlight", sampleRepair: "Renew the right headlight bulb" },
      ],
      "2026-11-18T12:00:00.000Z",
    );
    expect(rows).toEqual([
      {
        make_name: "FORD",
        model_label: "FORD Ranger",
        genart_id: 107,
        label: "Bulb, headlight",
        sample_repair: "Renew the left headlight bulb",
        last_reg: "S28BSW",
        last_seen_at: "2026-11-18T12:00:00.000Z",
      },
    ]);
  });
});
