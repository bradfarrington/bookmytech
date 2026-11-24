import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseAagEnvelope } from "@/lib/aag/client";
import { flattenQuote } from "@/lib/aag/quote";
import type { AagQuoteBody } from "@/lib/aag/types";
import {
  aagOffers,
  DEFAULT_PART_PICK_RULE,
  defaultOffer,
  inStock,
  offerLinePence,
  positionOf,
  ratingDistance,
  ratingRank,
  type PartPickRule,
  type SupplierOffer,
} from "./supplier-offer";

const offer = (over: Partial<SupplierOffer> = {}): SupplierOffer => ({
  supplier: "aag",
  partNumber: "X",
  description: null,
  brand: "Brand",
  tier: "Good",
  costPence: 1000,
  surchargePence: null,
  availability: [],
  totalQty: null,
  fitment: [],
  quantityOfFit: 1,
  position: null,
  imageUrl: null,
  notes: [],
  buyable: true,
  ...over,
});

describe("ratingRank", () => {
  it("ranks Best over Better over Good, in any case", () => {
    expect(ratingRank("Best")).toBe(3);
    expect(ratingRank("better")).toBe(2);
    expect(ratingRank("GOOD")).toBe(1);
    expect(ratingRank(null)).toBe(0);
    expect(ratingRank("Premium")).toBe(0);
  });
});

describe("defaultOffer", () => {
  it("takes the best-rated part even when a lower-rated one costs more", () => {
    const offers = [
      offer({ partNumber: "better", tier: "Better", costPence: 3041 }),
      offer({ partNumber: "best", tier: "Best", costPence: 2837 }),
    ];
    expect(defaultOffer(offers)?.partNumber).toBe("best");
  });

  it("takes the dearest within that rating, for the quantity the vehicle takes", () => {
    const offers = [
      offer({ partNumber: "single", tier: "Best", costPence: 3000, quantityOfFit: 1 }),
      offer({ partNumber: "pair", tier: "Best", costPence: 2000, quantityOfFit: 2 }),
    ];
    expect(defaultOffer(offers)?.partNumber).toBe("pair");
  });

  it("ignores anything we can't buy", () => {
    expect(defaultOffer([offer({ tier: "Best", buyable: false }), offer({ partNumber: "ok" })])?.partNumber).toBe("ok");
    expect(defaultOffer([offer({ costPence: null, buyable: false })])).toBeNull();
    expect(defaultOffer([])).toBeNull();
  });
});

// Task 85: Gareth chooses price, rating and stock under Pricing.
describe("defaultOffer with a pick rule", () => {
  const rule = (over: Partial<PartPickRule>): PartPickRule => ({ ...DEFAULT_PART_PICK_RULE, ...over });
  const pads = [
    offer({ partNumber: "good-in", tier: "Good", costPence: 1200, totalQty: 3 }),
    offer({ partNumber: "good-out", tier: "Good", costPence: 900, totalQty: 0 }),
    offer({ partNumber: "better-in", tier: "Better", costPence: 1800, totalQty: 5 }),
    offer({ partNumber: "best-out", tier: "Best", costPence: 2500, totalQty: 0 }),
    offer({ partNumber: "best-in", tier: "Best", costPence: 2000, totalQty: 1 }),
    offer({ partNumber: "best-in-dear", tier: "Best", costPence: 2400, totalQty: 2 }),
  ];
  const pick = (over: Partial<PartPickRule>, offers = pads) => defaultOffer(offers, rule(over))?.partNumber;

  it("is today's rule when unset: Best, dearest, stock ignored", () => {
    expect(defaultOffer(pads)?.partNumber).toBe("best-out");
    expect(pick({})).toBe("best-out");
  });

  it("cheapest in stock, any rating: Gareth's ask", () => {
    expect(pick({ price: "cheapest", rating: "any", stock: "in_stock" })).toBe("good-in");
    // Stock ignored, the cheapest of all.
    expect(pick({ price: "cheapest", rating: "any", stock: "any" })).toBe("good-out");
  });

  it("checks stock first, then the rating, then the price", () => {
    expect(pick({ price: "cheapest", rating: "best", stock: "in_stock" })).toBe("best-in");
    expect(pick({ price: "dearest", rating: "best", stock: "in_stock" })).toBe("best-in-dear");
    expect(pick({ price: "dearest", rating: "good", stock: "in_stock" })).toBe("good-in");
  });

  it("falls back to an out-of-stock part when nothing is in stock", () => {
    const none = pads.map((o) => ({ ...o, totalQty: 0 }));
    expect(pick({ price: "cheapest", rating: "any", stock: "in_stock" }, none)).toBe("good-out");
    // No stock figures at all reads as out of stock, and still prices.
    expect(pick({ price: "cheapest", rating: "any", stock: "in_stock" }, [offer({ partNumber: "x", totalQty: null })])).toBe("x");
  });

  it("takes the nearest rating when NAPA has none at the one wanted: above first, then below", () => {
    const noBetter = pads.filter((o) => o.tier !== "Better");
    expect(pick({ price: "cheapest", rating: "better" }, noBetter)).toBe("best-in");
    const onlyGood = pads.filter((o) => o.tier === "Good");
    expect(pick({ price: "cheapest", rating: "best" }, onlyGood)).toBe("good-out");
    // An in-stock Better beats an out-of-stock Best when stock comes first.
    const mixed = [offer({ partNumber: "best-out", tier: "Best", totalQty: 0 }), offer({ partNumber: "better-in", tier: "Better", totalQty: 4 })];
    expect(pick({ rating: "best", stock: "in_stock" }, mixed)).toBe("better-in");
  });

  it("ranks ratings by distance from the one wanted", () => {
    expect(["Best", "Better", "Good", null].map((t) => ratingDistance(t, "better"))).toEqual([1, 0, 11, 12]);
    expect(["Best", "Better", "Good", null].map((t) => ratingDistance(t, "best"))).toEqual([0, 11, 12, 13]);
    expect(ratingDistance("Good", "any")).toBe(0);
    expect(inStock({ totalQty: 2 })).toBe(true);
    expect(inStock({ totalQty: 0 })).toBe(false);
    expect(inStock({ totalQty: null })).toBe(false);
  });
});

describe("offerLinePence", () => {
  it("prices the quantity the vehicle takes", () => {
    expect(offerLinePence(offer({ costPence: 4354, quantityOfFit: 2 }))).toBe(8708);
    expect(offerLinePence(offer({ costPence: 999, quantityOfFit: null }))).toBe(999);
    expect(offerLinePence(offer({ costPence: null }))).toBeNull();
  });
});

describe("positionOf", () => {
  it("reads AAG's fitting position, then the description", () => {
    expect(positionOf("FR", null)).toBe("front");
    expect(positionOf("RR", "anything")).toBe("rear");
    expect(positionOf("", "BRAKE PAD - REAR")).toBe("rear");
    expect(positionOf(null, "Front and rear")).toBeNull();
    expect(positionOf(null, "AIR FILTER")).toBeNull();
  });
});

// Real sandbox replies, captured 2026-09-14 for DV12CGU.
const fixture = (name: string) => join(__dirname, "..", "aag", "__fixtures__", name);

function fixtureOffers(name: string): SupplierOffer[] {
  const parsed = parseAagEnvelope<AagQuoteBody>(JSON.parse(readFileSync(fixture(name), "utf8")));
  if (!parsed.ok) throw new Error(`${name} is not a successful AAG envelope`);
  return aagOffers(flattenQuote(parsed.body));
}

describe.skipIf(!existsSync(fixture("quote-82.json")))("aagOffers on AAG's brake discs", () => {
  it("prices discs per disc and buys them in pairs", () => {
    const offers = fixtureOffers("quote-82.json");
    expect(offers).toHaveLength(6);
    for (const o of offers) {
      expect(o.supplier).toBe("aag");
      expect(o.quantityOfFit).toBe(2);
      expect(Number.isInteger(o.costPence)).toBe(true);
    }
  });

  it("knows each disc's axle", () => {
    const offers = fixtureOffers("quote-82.json");
    expect(offers.filter((o) => o.position === "front")).toHaveLength(3);
    expect(offers.filter((o) => o.position === "rear")).toHaveLength(3);
  });

  it("treats a £0.00 surcharge as no core charge", () => {
    for (const o of fixtureOffers("quote-82.json")) {
      expect(o.surchargePence).toBeNull();
      expect(o.notes.join(" ")).not.toContain("core charge");
    }
  });

  it("defaults to the Brembo Best front pair", () => {
    const best = defaultOffer(fixtureOffers("quote-82.json"));
    expect(best?.partNumber).toBe("BRE09.7629.11");
    expect(offerLinePence(best!)).toBe(8708);
  });
});

describe.skipIf(!existsSync(fixture("quote-402.json")))("aagOffers on AAG's brake pads", () => {
  it("defaults to Brembo Best over a dearer APEC Better", () => {
    const best = defaultOffer(fixtureOffers("quote-402.json"));
    expect(best?.partNumber).toBe("BREP59045");
    expect(best?.costPence).toBe(2837);
    expect(best?.quantityOfFit).toBe(1);
  });
});
