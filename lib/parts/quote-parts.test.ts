import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseAagEnvelope } from "@/lib/aag/client";
import { flattenQuote } from "@/lib/aag/quote";
import type { AagQuoteBody } from "@/lib/aag/types";
import type { AagPartOffers } from "./aag-part-prices";
import {
  catalogueBookingPartRows,
  choiceKey,
  customerPartLines,
  priceJobParts,
  type PartsJob,
  type QuotedPart,
} from "./quote-parts";
import { aagOffers, type SupplierOffer } from "./supplier-offer";

const PRICED_AT = "2026-09-15T11:00:00.000Z";

// Real sandbox replies, captured 2026-09-14 for DV12CGU.
const fixture = (name: string) => join(__dirname, "..", "aag", "__fixtures__", name);

function answer(name: string): AagPartOffers {
  const parsed = parseAagEnvelope<AagQuoteBody>(JSON.parse(readFileSync(fixture(name), "utf8")));
  if (!parsed.ok) throw new Error(`${name} is not a successful AAG envelope`);
  return { state: "ok", offers: aagOffers(flattenQuote(parsed.body)), pricedAt: PRICED_AT, lastKnown: false };
}

const haveFixtures = existsSync(fixture("quote-82.json")) && existsSync(fixture("quote-402.json"));

describe.skipIf(!haveFixtures)("priceJobParts on AAG's brake parts", () => {
  const offers = () =>
    new Map<number, AagPartOffers>([
      [82, answer("quote-82.json")],
      [402, answer("quote-402.json")],
    ]);
  const rearPads: PartsJob = { nodeId: "rear-pads", description: "Renew the rear brake pads", groups: [{ genartId: 402, label: "Brake pads" }] };
  const discs: PartsJob = { nodeId: "discs", description: "Renew the brake discs", groups: [{ genartId: 82, label: "Brake disc" }] };
  const summary = (parts: QuotedPart[]) => parts.map((p) => [p.partNumber, p.position, p.quantity, p.linePence]);

  it("prices a rear job with the rear part only", () => {
    const result = priceJobParts({ jobs: [rearPads], offers: offers() });
    expect(result.ok && summary(result.parts)).toEqual([["BREP59038", "rear", 1, 2107]]);
  });

  it("prices a pair of discs for each axle when the job names neither", () => {
    const result = priceJobParts({ jobs: [discs], offers: offers() });
    expect(result.ok && summary(result.parts)).toEqual([
      ["BRE09.7629.11", "front", 2, 8708],
      ["BRE08.7627.11", "rear", 2, 6170],
    ]);
  });

  it("uses the admin's choice for this engine variant", () => {
    const choices = new Map([
      [
        choiceKey("rear-pads", 402),
        { car_type_id: 1, node_id: "rear-pads", genart_id: 402, supplier: "aag" as const, part_number: "BFTPD3070", brand: "BRAKEFIT", description: null, chosen_at: PRICED_AT },
      ],
    ]);
    const result = priceJobParts({ jobs: [rearPads], offers: offers(), choices });
    expect(result.ok && result.parts[0]).toMatchObject({ partNumber: "BFTPD3070", source: "chosen", linePence: 1370 });
  });

  it("charges each job its own parts", () => {
    const result = priceJobParts({ jobs: [rearPads, { ...rearPads, nodeId: "rear-pads-again" }], offers: offers() });
    expect(result.ok && result.parts.map((p) => p.nodeId)).toEqual(["rear-pads", "rear-pads-again"]);
  });
});

describe("priceJobParts", () => {
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
  const filters: AagPartOffers = { state: "ok", offers: [filter], pricedAt: PRICED_AT, lastKnown: false };
  const job: PartsJob = {
    nodeId: "air",
    description: "Renew the air filter",
    groups: [
      { genartId: 8, label: "Air filter" },
      { genartId: 2021, label: "Battery charger" },
    ],
  };

  it("skips a part group an admin switched off", () => {
    const result = priceJobParts({ jobs: [job], offers: new Map([[8, filters]]), uncharged: new Set([2021]) });
    expect(result.ok && result.parts.map((p) => [p.genartId, p.linePence, p.source])).toEqual([[8, 2910, "default"]]);
  });

  it("can't price a charged group AAG lists nothing for, but keeps what it did price", () => {
    const result = priceJobParts({
      jobs: [job],
      offers: new Map<number, AagPartOffers>([
        [8, filters],
        [2021, { state: "empty", pricedAt: PRICED_AT }],
      ]),
    });
    expect(result).toMatchObject({
      ok: false,
      missing: [{ nodeId: "air", genartId: 2021, label: "Battery charger", position: null }],
    });
    expect(result.parts.map((p) => p.genartId)).toEqual([8]);
  });

  it("can't price a group AAG couldn't be asked about", () => {
    const result = priceJobParts({ jobs: [job], offers: new Map([[8, { state: "unavailable" }]]), uncharged: new Set([2021]) });
    expect(result.ok).toBe(false);
  });

  it("uses the admin's set price when AAG has none", () => {
    const antifreeze: PartsJob = { nodeId: "head", description: "Remove/refit the cylinder head", groups: [{ genartId: 3356, label: "Antifreeze" }] };
    const result = priceJobParts({
      jobs: [antifreeze],
      offers: new Map<number, AagPartOffers>([[3356, { state: "empty", pricedAt: PRICED_AT }]]),
      setPrices: new Map([[3356, { pence: 1250, setAt: "2026-09-15T20:00:00.000Z" }]]),
    });
    expect(result).toEqual({
      ok: true,
      parts: [
        {
          nodeId: "head",
          genartId: 3356,
          groupLabel: "Antifreeze",
          supplier: null,
          partNumber: null,
          brand: null,
          description: null,
          imageUrl: null,
          position: null,
          rating: null,
          quantity: 1,
          unitPence: 1250,
          linePence: 1250,
          source: "set_price",
          lastKnown: false,
          pricedAt: "2026-09-15T20:00:00.000Z",
        },
      ],
    });
  });

  it("prefers AAG's price to the set price", () => {
    const result = priceJobParts({
      jobs: [job],
      offers: new Map([[8, filters]]),
      uncharged: new Set([2021]),
      setPrices: new Map([[8, { pence: 999, setAt: PRICED_AT }]]),
    });
    expect(result.ok && result.parts[0]).toMatchObject({ source: "default", linePence: 2910 });
  });

  it("carries a last known price through", () => {
    const result = priceJobParts({ jobs: [job], offers: new Map([[8, { ...filters, lastKnown: true }]]), uncharged: new Set([2021]) });
    expect(result.ok && result.parts[0].lastKnown).toBe(true);
  });

  it("prices nothing for a job with no part groups", () => {
    expect(priceJobParts({ jobs: [{ nodeId: "check", description: "Check the brakes", groups: [] }], offers: new Map() })).toEqual({
      ok: true,
      parts: [],
    });
  });
});

describe("catalogueBookingPartRows", () => {
  const disc: QuotedPart = {
    nodeId: "discs",
    genartId: 82,
    groupLabel: "Brake disc",
    supplier: "aag",
    partNumber: "BRE09.7629.11",
    brand: "BREMBO",
    description: "B/DISC 280 * 5 (VENTED) - FRONT",
    imageUrl: null,
    position: "front",
    rating: "Best",
    quantity: 2,
    unitPence: 4354,
    linePence: 8708,
    source: "default",
    lastKnown: false,
    pricedAt: PRICED_AT,
  };

  it("names the part and axle, and records exactly what to buy", () => {
    expect(catalogueBookingPartRows("booking-1", [disc])).toEqual([
      {
        booking_id: "booking-1",
        part_id: null,
        part_name: "Brake disc (front) · BREMBO",
        quantity: 2,
        unit_price_pence: 4354,
        total_pence: 8708,
        sourcing: "self",
        status: "pending",
        source: "catalogue",
        supplier: "aag",
        supplier_part_number: "BRE09.7629.11",
        brand: "BREMBO",
        genart_id: 82,
        node_id: "discs",
        priced_at: PRICED_AT,
      },
    ]);
  });

  it("records a set price with no supplier part", () => {
    const [row] = catalogueBookingPartRows("booking-1", [
      { ...disc, supplier: null, partNumber: null, brand: null, position: null, groupLabel: "Antifreeze", quantity: 1, unitPence: 1250, linePence: 1250, source: "set_price" },
    ]);
    expect(row).toMatchObject({ part_name: "Antifreeze", supplier: null, supplier_part_number: null, total_pence: 1250, source: "catalogue" });
  });
});

describe("customerPartLines", () => {
  it("is the parts shape the app reads from /quote and /checkout/prepare", () => {
    const part: QuotedPart = {
      nodeId: "discs",
      genartId: 82,
      groupLabel: "Brake disc",
      supplier: "aag",
      partNumber: "BRE09.7629.11",
      brand: "BREMBO",
      description: "B/DISC 280 * 5 (VENTED) - FRONT",
      imageUrl: null,
      position: "front",
      rating: "Best",
      quantity: 2,
      unitPence: 4354,
      linePence: 8708,
      source: "default",
      lastKnown: false,
      pricedAt: PRICED_AT,
    };
    expect(customerPartLines([part])).toEqual([
      { nodeId: "discs", name: "Brake disc", brand: "BREMBO", position: "front", quantity: 2, unitPence: 4354, linePence: 8708 },
    ]);
  });
});
