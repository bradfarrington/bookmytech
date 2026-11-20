import { describe, expect, it } from "vitest";

import { foldProductParts } from "@/lib/catalogue/level-parts";
import { buildRepairsQuote } from "@/lib/haynespro/repair-booking";
import type { AagPartOffers } from "@/lib/parts/aag-part-prices";
import { fluidKind, priceJobParts } from "@/lib/parts/quote-parts";
import type { SupplierOffer } from "@/lib/parts/supplier-offer";
import { toProductNode, toQuotableProduct, type CatalogueProductRow } from "./products";
import { servicePartsJobs, servicePartTypes } from "./service-parts";

const PRICED_AT = "2026-11-20T10:00:00.000Z";
const RATE = 6000;

function offer(partNumber: string, costPence: number, extra: Partial<SupplierOffer> = {}): SupplierOffer {
  return {
    supplier: "aag",
    partNumber,
    description: partNumber,
    brand: "BOSCH",
    tier: "Best",
    costPence,
    surchargePence: null,
    availability: [],
    totalQty: null,
    fitment: [],
    quantityOfFit: 1,
    position: null,
    imageUrl: null,
    notes: [],
    buyable: true,
    ...extra,
  };
}

const ok = (...offers: SupplierOffer[]): AagPartOffers => ({ state: "ok", offers, pricedAt: PRICED_AT, lastKnown: false });

// A petrol Major service as Gareth listed it (2026-11-20).
const majorPetrol: CatalogueProductRow = {
  id: "major-petrol",
  category: "servicing",
  name: "Major service",
  summary: null,
  description: null,
  price_pence: 15000,
  labour_hours: null,
  duration_hours: 1.75,
  includes_engine_oil: true,
  display_order: 2,
  is_active: true,
  fuel_types: ["petrol"],
  part_genart_ids: [686, 424, 8, 7],
};

const napa = new Map<number, AagPartOffers>([
  [7, ok(offer("OIL-1", 768))],
  [8, ok(offer("AIR-1", 1356))],
  [424, ok(offer("CABIN-1", 1979))],
  [686, ok(offer("PLUG-1", 481, { perVehicle: 4 }))],
]);

describe("servicePartTypes", () => {
  it("keeps known part types once, in the admin's order, and drops anything else", () => {
    expect(servicePartTypes([686, 7, 7, 999, "8"]).map((t) => t.genartId)).toEqual([7, 8, 686]);
    expect(servicePartTypes(null)).toEqual([]);
    expect(servicePartTypes(undefined)).toEqual([]);
  });
});

describe("the part types a service can tick", () => {
  it("buys fluids by the litre and plugs per cylinder", () => {
    const byId = new Map(servicePartTypes([3357, 3356, 243, 686]).map((t) => [t.genartId, t]));
    expect(fluidKind(byId.get(3357)!.label)).toBe("brake_fluid");
    expect(fluidKind(byId.get(3356)!.label)).toBe("coolant");
    expect(byId.get(243)!.job).toMatch(/all the glow plugs/);
  });

  it("prices every glow plug NAPA says the engine has", () => {
    const glow = servicePartsJobs({ id: "p:x", partTypes: servicePartTypes([243]) });
    const result = priceJobParts({ jobs: glow, offers: new Map([[243, ok(offer("GLOW-1", 1337, { perVehicle: 4 }))]]) });
    expect(result.parts.map((p) => [p.quantity, p.linePence])).toEqual([[4, 4 * 1337]]);
  });
});

describe("a service's NAPA parts", () => {
  const product = toQuotableProduct(majorPetrol);

  it("prices each part under the service's own id, every spark plug the engine has", () => {
    const result = priceJobParts({ jobs: servicePartsJobs(product), offers: napa });
    expect(result.ok).toBe(true);
    expect(result.parts.map((p) => [p.nodeId, p.groupLabel, p.quantity, p.linePence])).toEqual([
      ["p:major-petrol", "Oil filter", 1, 768],
      ["p:major-petrol", "Air filter", 1, 1356],
      ["p:major-petrol", "Pollen filter", 1, 1979],
      ["p:major-petrol", "Spark plugs", 4, 1924],
    ]);
  });

  it("needs a quote when NAPA doesn't say how many plugs the engine has", () => {
    const offers = new Map(napa);
    offers.set(686, ok(offer("PLUG-1", 481)));
    const result = priceJobParts({ jobs: servicePartsJobs(product), offers });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.missing.map((m) => [m.nodeId, m.genartId])).toEqual([["p:major-petrol", 686]]);
  });

  it("is listed with its part types so an unpriced row reads '+ parts', not as the whole price", () => {
    expect(toProductNode(product, RATE, null)?.genartIds).toEqual([7, 8, 424, 686]);
    const noParts = toQuotableProduct({ ...majorPetrol, part_genart_ids: null });
    expect(toProductNode(noParts, RATE, null)).not.toHaveProperty("genartIds");
  });

  it("adds the parts on top of the labour and oil in the quote", () => {
    const parts = priceJobParts({ jobs: servicePartsJobs(product), offers: napa }).parts;
    const oil = { litres: 4, pencePerLitre: 1000, pence: 4000, source: "haynespro" as const, label: null };
    const quote = buildRepairsQuote({
      items: [],
      products: [product],
      oil,
      parts,
      combined: null,
      hourlyRatePence: RATE,
      commissionRate: 0.2,
    });
    expect(quote?.breakdown.partsPence).toBe(4000 + 768 + 1356 + 1979 + 1924);
    expect(quote?.breakdown.totalPence).toBe(15000 + 4000 + 768 + 1356 + 1979 + 1924);
  });
});

describe("foldProductParts", () => {
  const rows = [
    { id: "p:a", partTypes: servicePartTypes([7]) },
    { id: "p:b", partTypes: servicePartTypes([7, 686]) },
  ];

  it("totals each service's parts", () => {
    const result = priceJobParts({ jobs: rows.flatMap(servicePartsJobs), offers: napa });
    const folded = foldProductParts(rows, result);
    expect([...folded.totals]).toEqual([
      ["p:a", 768],
      ["p:b", 768 + 1924],
    ]);
    expect(folded.needsQuote.size).toBe(0);
  });

  it("flags only the service NAPA couldn't price for a quote", () => {
    const offers = new Map(napa);
    offers.set(686, { state: "empty", pricedAt: PRICED_AT });
    const folded = foldProductParts(rows, priceJobParts({ jobs: rows.flatMap(servicePartsJobs), offers }));
    expect([...folded.totals]).toEqual([["p:a", 768]]);
    expect([...folded.needsQuote]).toEqual(["p:b"]);
  });
});
