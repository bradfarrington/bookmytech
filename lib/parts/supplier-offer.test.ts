import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseAagEnvelope } from "@/lib/aag/client";
import { flattenQuote } from "@/lib/aag/quote";
import type { AagQuoteBody } from "@/lib/aag/types";
import { aagOffers, dearestOffer, type SupplierOffer } from "./supplier-offer";

const offer = (over: Partial<SupplierOffer> = {}): SupplierOffer => ({
  supplier: "aag",
  partNumber: "BRE09.7629.11",
  description: "B/DISC 280 * 5 (VENTED) - FRONT",
  brand: "BREMBO",
  tier: "Best",
  costPence: 4354,
  surchargePence: null,
  availability: [],
  totalQty: null,
  fitment: [],
  quantityOfFit: null,
  imageUrl: null,
  notes: [],
  buyable: true,
  ...over,
});

describe("dearestOffer", () => {
  it("is the most expensive part we can actually buy", () => {
    const offers = [
      offer({ partNumber: "a", costPence: 3000 }),
      offer({ partNumber: "b", costPence: 9000, buyable: false }),
      offer({ partNumber: "c", costPence: 4500 }),
      offer({ partNumber: "d", costPence: null, buyable: false }),
    ];
    expect(dearestOffer(offers)?.partNumber).toBe("c");
    expect(dearestOffer([offer({ buyable: false })])).toBeNull();
    expect(dearestOffer([])).toBeNull();
  });
});

// A real sandbox reply, captured 2026-09-14 for DV12CGU (brake discs, GenArt 82).
const fixturePath = join(__dirname, "..", "aag", "__fixtures__", "quote-82.json");

function fixtureOffers(): SupplierOffer[] {
  const parsed = parseAagEnvelope<AagQuoteBody>(JSON.parse(readFileSync(fixturePath, "utf8")));
  if (!parsed.ok) throw new Error("fixture is not a successful AAG envelope");
  return aagOffers(flattenQuote(parsed.body));
}

describe.skipIf(!existsSync(fixturePath))("aagOffers on a captured AAG quote", () => {
  it("maps every product option into an AAG offer in integer pence", () => {
    const offers = fixtureOffers();
    expect(offers).toHaveLength(6);
    for (const o of offers) {
      expect(o.supplier).toBe("aag");
      expect(o.partNumber).toMatch(/\S/);
      expect(o.costPence == null || Number.isInteger(o.costPence)).toBe(true);
    }
  });

  it("keeps the fitting position AAG gives", () => {
    const positions = new Set(fixtureOffers().flatMap((o) => o.fitment.map((f) => f.value)));
    expect(positions).toEqual(new Set(["FR", "RR"]));
  });

  it("finds the dearest buyable disc", () => {
    expect(dearestOffer(fixtureOffers())?.costPence).toBe(4354);
  });
});
