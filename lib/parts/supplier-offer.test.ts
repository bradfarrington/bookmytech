import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { fitmentLabels } from "@/lib/lkq/fitment";
import { groupByKey } from "@/lib/lkq/mapping";
import { splitParts } from "@/lib/lkq/price";
import type { AdsPartsReply } from "@/lib/lkq/types";
import { extractSoapResult, parseXml } from "@/lib/lkq/xml";
import {
  bestPriceAcross,
  cheapestOffer,
  groupOffers,
  lkqOffers,
  type SupplierOffer,
  type SupplierPanel,
} from "./supplier-offer";

const offer = (over: Partial<SupplierOffer> = {}): SupplierOffer => ({
  supplier: "lkq",
  groupKey: "10459026",
  partNumber: "104590266",
  description: "FRONT DISC",
  brand: "TEXTAR",
  tier: "OES",
  costPence: 3167,
  surchargePence: null,
  rrpPence: 7642,
  availability: [],
  totalQty: null,
  fitment: [],
  quantityOfFit: 2,
  imageUrl: null,
  notes: [],
  buyable: true,
  ...over,
});

describe("cheapestOffer", () => {
  it("ignores anything we can't actually buy", () => {
    const offers = [
      offer({ partNumber: "a", costPence: 6690 }),
      offer({ partNumber: "b", costPence: null, buyable: false }),
      offer({ partNumber: "c", costPence: 3167 }),
    ];
    expect(cheapestOffer(offers)?.partNumber).toBe("c");
    expect(cheapestOffer([offer({ buyable: false, costPence: null })])).toBeNull();
    expect(cheapestOffer([])).toBeNull();
  });
});

describe("bestPriceAcross", () => {
  const okPanel = (offers: SupplierOffer[]): SupplierPanel => ({
    state: "ok",
    offers,
    cheapestPartNumber: cheapestOffer(offers)?.partNumber ?? null,
    notFound: [],
    cached: false,
  });

  it("picks the cheaper supplier", () => {
    const best = bestPriceAcross({
      lkq: okPanel([offer({ costPence: 4200 })]),
      aag: okPanel([offer({ supplier: "aag", partNumber: "X1", costPence: 3900 })]),
    });
    expect(best?.supplier).toBe("aag");
    expect(best?.offer.costPence).toBe(3900);
  });

  it("ignores a disconnected supplier rather than treating it as free", () => {
    // The whole point: AAG being unavailable must not read as "AAG is cheapest
    // at £0" or crash the comparison.
    const best = bestPriceAcross({
      lkq: okPanel([offer({ costPence: 4200 })]),
      aag: { state: "not_connected", message: "…", hint: null, href: null },
    });
    expect(best?.supplier).toBe("lkq");
    expect(best?.offer.costPence).toBe(4200);
  });

  it("returns null when nobody answered", () => {
    expect(
      bestPriceAcross({
        lkq: { state: "error", message: "…" },
        aag: { state: "not_connected", message: "…", hint: null, href: null },
      }),
    ).toBeNull();
  });
});

describe("groupOffers", () => {
  it("keeps variants of one catalogue part together, in order", () => {
    const groups = groupOffers([
      offer({ groupKey: "A", partNumber: "A1" }),
      offer({ groupKey: "B", partNumber: "B1" }),
      offer({ groupKey: "A", partNumber: "A2" }),
    ]);
    expect(groups.map((g) => g.groupKey)).toEqual(["A", "B"]);
    expect(groups[0].offers.map((o) => o.partNumber)).toEqual(["A1", "A2"]);
  });
});

// ---------------------------------------------------------------------------
// The real join: a real ADS catalogue reply against a real ECP price reply,
// both captured from the live test service on 2026-09-11 for NV57XGP.
// ---------------------------------------------------------------------------

const fixture = (name: string) => join(__dirname, "..", "lkq", "__fixtures__", name);
const adsPath = fixture("ads-parts-000027-1.json");
const ecpPath = fixture("ecp-getprice-000027-fleet.xml");

describe.skipIf(!existsSync(adsPath) || !existsSync(ecpPath))(
  "LKQ catalogue joined to LKQ pricing",
  () => {
    const adsReply = JSON.parse(readFileSync(adsPath, "utf8")) as AdsPartsReply;
    const reply = parseXml(
      extractSoapResult("GetPrice", readFileSync(ecpPath, "utf8")) as string,
    ) as never as { REPLY: never };
    const { rows } = splitParts(reply.REPLY);

    const group = groupByKey("brake-discs")!;
    const offers = lkqOffers(group, adsReply.Parts ?? [], fitmentLabels(adsReply), rows);

    it("turns catalogue parts into a branded ladder of offers", () => {
      // 14 distinct catalogue numbers, each expanding to several ECP variants.
      expect(offers.length).toBeGreaterThan(adsReply.Parts!.length);
      expect(groupOffers(offers).length).toBeGreaterThan(5);
    });

    it("carries ADS fitment and quantity-of-fit down onto every variant", () => {
      // ADS knows what fits; ECP knows the money. The join is what makes a row
      // useful — a price with no fitment is just a number.
      const withFitment = offers.filter((o) => o.fitment.length > 0);
      expect(withFitment.length).toBeGreaterThan(0);

      const labels = withFitment[0].fitment.map((f) => f.label);
      expect(labels).toContain("Brake Size");
      expect(labels).toContain("Fitting Position");

      // Brake discs come in pairs — missing this halves the parts cost.
      expect(withFitment[0].quantityOfFit).toBe(2);
    });

    it("takes descriptions and brands from ECP, which ADS does not supply", () => {
      const priced = offers.filter((o) => o.costPence != null);
      expect(priced.length).toBeGreaterThan(0);
      expect(priced.some((o) => o.brand)).toBe(true);
      expect(priced.some((o) => o.description)).toBe(true);
      // ADS itself carries neither.
      expect(adsReply.Parts![0]).not.toHaveProperty("Brand");
    });

    it("never presents a £0.00 part as a real price", () => {
      for (const o of offers) {
        if (o.costPence != null) expect(o.costPence).toBeGreaterThan(0);
        if (!o.buyable) expect(o.costPence == null || o.costPence === 0).toBe(true);
      }
    });

    it("treats an unpublished RRP as absent rather than as £0.00", () => {
      expect(offers.every((o) => o.rrpPence !== 0)).toBe(true);
    });

    it("keeps surcharges out of the cost figure", () => {
      for (const o of offers) {
        if (o.surchargePence != null) {
          expect(o.notes.join(" ")).toContain("not added to the cost");
        }
      }
    });

    it("finds a genuine cheapest we could buy", () => {
      const cheapest = cheapestOffer(offers);
      expect(cheapest).not.toBeNull();
      expect(cheapest!.costPence).toBeGreaterThan(0);
      expect(cheapest!.buyable).toBe(true);
    });
  },
);
