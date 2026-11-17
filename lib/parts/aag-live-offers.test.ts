import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { AagQuoteClassicOutcome, AagQuoteOutcome } from "@/lib/aag/client";
import { classicToQuoteBody, flattenQuote } from "@/lib/aag/quote";
import type { AagQuoteBody, AagQuoteClassicBody } from "@/lib/aag/types";
import { fetchAagLiveOffers, type AagLookups } from "./aag-live-offers";
import { aagOffers, defaultOffer } from "./supplier-offer";

// Trimmed from NAPA's live /api/quote/classic reply for FN60KYP, GenArt 82,
// 2026-11-17: camelCase, lower-case ratings, "Front Axle" fitment, branches
// quickest first, "N/A" for an empty branch.
const CLASSIC: AagQuoteClassicBody = {
  products: [
    {
      productId: "BRE09.A968.21",
      description: "BRAKE DISC PAIR (PRICE PER DISC)",
      supplier: { supplierName: "BREMBO" },
      costPrice: 45.69,
      surcharge: 0,
      recMinOrdQty: 2,
      fitment: "Front Axle",
      productRating: "best",
      customerLockoutRating: "UNKNOWN",
      stock: [
        { aagLocationId: 326, branchName: "NAPA Auto Parts - Tamworth", count: 3, deliveryNotes: "17:03" },
        { aagLocationId: 580, branchName: "Birmingham", count: 4, deliveryNotes: "09:45 NWD" },
      ],
    },
    {
      productId: "BRE08.4931.21",
      description: "BRAKE DISC PAIR (PRICE PER DISC)",
      supplier: { supplierName: "BREMBO" },
      costPrice: 30.47,
      recMinOrdQty: 2,
      fitment: "Rear Axle",
      productRating: "best",
      stock: [{ aagLocationId: 582, branchName: "Rotherham NDC", count: 1, deliveryNotes: "11:45 NWD" }],
    },
    {
      productId: "FAHFBD6113",
      description: "FAHREN BRAKE DISC - FRONT",
      supplier: { supplierName: "FAHREN" },
      costPrice: 26.96,
      recMinOrdQty: 2,
      fitment: "Front Axle",
      productRating: "good",
      stock: [
        { aagLocationId: 326, branchName: "NAPA Auto Parts - Tamworth", count: 0, deliveryNotes: "N/A" },
        { aagLocationId: 582, branchName: "Rotherham NDC", count: 681, deliveryNotes: "11:45 NWD" },
      ],
    },
  ],
};

const QUOTE: AagQuoteBody = {
  Articles: [
    {
      ArticleDescription: "B/DISC 258 * 4 (VENTED) - FRONT",
      FittingPosition: "FR",
      ProductOptions: [
        { ProductId: "NPANBD5431", Brand: "NAPA", BrandRating: "Better", CostPrice: 31.85, RecMinOrdQty: 2, Availability: [] },
      ],
    },
  ],
};

describe("classicToQuoteBody", () => {
  const lines = flattenQuote(classicToQuoteBody(CLASSIC));

  it("turns each classic product into one quote line", () => {
    expect(lines.map((l) => l.productId)).toEqual(["BRE09.A968.21", "BRE08.4931.21", "FAHFBD6113"]);
  });

  it("reads the price, unit of issue and brand", () => {
    expect(lines[0]).toMatchObject({ costPence: 4569, minOrderQty: 2, brand: "BREMBO", sellable: true });
  });

  it("uses the standard quote's rating casing", () => {
    expect(lines.map((l) => l.rating)).toEqual(["Best", "Best", "Good"]);
  });

  it("maps the axle to the standard quote's fitting codes", () => {
    expect(lines.map((l) => l.fittingPosition)).toEqual(["FR", "RR", "FR"]);
  });

  it("ranks stocked branches in NAPA's order and never makes an empty branch quickest", () => {
    expect(lines[0].quickest?.locationName).toBe("NAPA Auto Parts - Tamworth");
    expect(lines[2].quickest?.locationName).toBe("Rotherham NDC");
    expect(lines[2].stock[0]).toMatchObject({ qty: 0, eta: null });
    expect(lines[0].stock[1].eta).toBe("09:45 NWD");
  });

  it("gives offers the right axles, so a front job never takes the rear disc", () => {
    const offers = aagOffers(lines);
    expect(offers.map((o) => o.position)).toEqual(["front", "rear", "front"]);
    expect(defaultOffer(offers.filter((o) => o.position === "front"))?.partNumber).toBe("BRE09.A968.21");
  });

  it("is empty for an empty or missing body", () => {
    expect(classicToQuoteBody(null).Articles).toEqual([]);
    expect(classicToQuoteBody({ products: null }).Articles).toEqual([]);
  });
});

const fixturePath = join(__dirname, "../aag/__fixtures__/quote-classic-82.json");
describe.skipIf(!existsSync(fixturePath))("classicToQuoteBody on a captured classic reply", () => {
  it("keeps every product and every price", () => {
    const raw = JSON.parse(readFileSync(fixturePath, "utf8")) as { body: AagQuoteClassicBody };
    const offers = aagOffers(flattenQuote(classicToQuoteBody(raw.body)));
    expect(offers).toHaveLength(raw.body.products?.length ?? 0);
    expect(offers.every((o) => o.costPence != null && o.costPence > 0)).toBe(true);
    expect(offers.every((o) => ["Good", "Better", "Best"].includes(o.tier ?? ""))).toBe(true);
  });
});

function lookups(quote: AagQuoteOutcome | Error, classic: AagQuoteClassicOutcome | Error) {
  const calls: string[] = [];
  const fake: AagLookups = {
    quote: async () => {
      calls.push("quote");
      if (quote instanceof Error) throw quote;
      return quote;
    },
    classic: async () => {
      calls.push("classic");
      if (classic instanceof Error) throw classic;
      return classic;
    },
  };
  return { fake, calls };
}

describe("fetchAagLiveOffers: the standard quote, then the full catalogue", () => {
  it("uses the standard quote and never asks the full catalogue when it has parts", async () => {
    const { fake, calls } = lookups({ kind: "ok", body: QUOTE }, { kind: "ok", body: CLASSIC });
    const result = await fetchAagLiveOffers("FN60KYP", 82, {}, fake);
    expect(calls).toEqual(["quote"]);
    expect(result).toMatchObject({ kind: "ok", from: "quote" });
    if (result.kind === "ok") expect(result.offers.every((o) => !o.fromCatalogue)).toBe(true);
  });

  it("falls back to the full catalogue when the standard quote has no parts, and marks its parts", async () => {
    const { fake, calls } = lookups({ kind: "no_parts" }, { kind: "ok", body: CLASSIC });
    const result = await fetchAagLiveOffers("S28BSW", 4, {}, fake);
    expect(calls).toEqual(["quote", "classic"]);
    expect(result).toMatchObject({ kind: "ok", from: "classic" });
    if (result.kind === "ok") {
      expect(result.offers).toHaveLength(3);
      expect(result.offers.every((o) => o.fromCatalogue === true)).toBe(true);
    }
  });

  it("falls back when the standard quote fails (NAPA's general error)", async () => {
    const { fake } = lookups({ kind: "failed", reason: "ISE0047" }, { kind: "ok", body: CLASSIC });
    expect(await fetchAagLiveOffers("S28BSW", 318, {}, fake)).toMatchObject({ kind: "ok", from: "classic" });
  });

  it("falls back when the standard quote throws", async () => {
    const { fake } = lookups(new Error("network"), { kind: "ok", body: CLASSIC });
    expect(await fetchAagLiveOffers("S28BSW", 318, {}, fake)).toMatchObject({ kind: "ok", from: "classic" });
  });

  it("is 'no parts' when the standard quote says so and the full catalogue has nothing either", async () => {
    const { fake } = lookups({ kind: "no_parts" }, { kind: "failed", errorCode: "ISE0047", reason: "general" });
    expect(await fetchAagLiveOffers("S28BSW", 2037, {}, fake)).toEqual({ kind: "no_parts" });
  });

  it("stays a failure when the standard quote failed and the full catalogue's answer is ambiguous", async () => {
    const { fake } = lookups({ kind: "failed", reason: "timed out" }, { kind: "failed", errorCode: "ISE0047", reason: "general" });
    expect(await fetchAagLiveOffers("S28BSW", 2037, {}, fake)).toEqual({ kind: "failed", reason: "timed out" });
  });

  it("is 'no parts' when the standard quote failed but the full catalogue plainly says none", async () => {
    const { fake } = lookups({ kind: "failed", reason: "timed out" }, { kind: "no_parts" });
    expect(await fetchAagLiveOffers("S28BSW", 2037, {}, fake)).toEqual({ kind: "no_parts" });
  });
});
