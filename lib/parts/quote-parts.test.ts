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
  needsManualQuote,
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
      missing: [{ nodeId: "air", genartId: 2021, label: "Battery charger", position: null, reason: "not_listed" }],
    });
    expect(result.parts.map((p) => p.genartId)).toEqual([8]);
  });

  it("can't price a group AAG couldn't be asked about", () => {
    const result = priceJobParts({ jobs: [job], offers: new Map([[8, { state: "unavailable" }]]), uncharged: new Set([2021]) });
    expect(result.ok).toBe(false);
    // No answer goes to a manual quote too (Brad, 2026-11-17).
    expect(!result.ok && result.missing.map((m) => m.reason)).toEqual(["unavailable"]);
    expect(!result.ok && needsManualQuote(result.missing)).toBe(true);
  });

  it("needs a manual quote when NAPA lists the part but nothing it will price", () => {
    const unpriced: AagPartOffers = { state: "ok", offers: [{ ...filter, costPence: null }], pricedAt: PRICED_AT, lastKnown: false };
    const result = priceJobParts({ jobs: [job], offers: new Map([[8, unpriced]]), uncharged: new Set([2021]) });
    expect(!result.ok && result.missing.map((m) => m.reason)).toEqual(["not_listed"]);
    expect(!result.ok && needsManualQuote(result.missing)).toBe(true);
  });

  it("needs a manual quote for any unpriced part, listed or not answered", () => {
    expect(needsManualQuote([{ reason: "unavailable" }, { reason: "not_listed" }])).toBe(true);
    expect(needsManualQuote([{ reason: "unavailable" }])).toBe(true);
    expect(needsManualQuote([])).toBe(false);
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

  describe("one part listed under two part types (job 00133)", () => {
    const belt: SupplierOffer = { ...filter, partNumber: "GAT5PK1650", brand: "GATES", description: "V-RIBBED BELT", costPence: 1877 };
    const ok = (list: SupplierOffer[]): AagPartOffers => ({ state: "ok", offers: list, pricedAt: PRICED_AT, lastKnown: false });
    const beltJob: PartsJob = {
      nodeId: "belt",
      description: "Renew the ancillary drive belt",
      groups: [
        { genartId: 10, label: "V-belt" },
        { genartId: 305, label: "V-ribbed belt" },
      ],
    };

    it("charges the shared part once", () => {
      const result = priceJobParts({ jobs: [beltJob], offers: new Map([[10, ok([belt])], [305, ok([belt])]]) });
      expect(result.ok && result.parts.map((p) => [p.genartId, p.partNumber, p.linePence])).toEqual([[10, "GAT5PK1650", 1877]]);
    });

    it("still charges each job its own belt", () => {
      const result = priceJobParts({
        jobs: [beltJob, { ...beltJob, nodeId: "belt-2" }],
        offers: new Map([[10, ok([belt])], [305, ok([belt])]]),
      });
      expect(result.ok && result.parts.map((p) => p.nodeId)).toEqual(["belt", "belt-2"]);
    });

    const bulbJob: PartsJob = {
      nodeId: "bulb",
      description: "Renew the left main beam bulb",
      groups: [
        { genartId: 107, label: "Bulb, headlight" },
        { genartId: 106, label: "Bulb, high beam headlight" },
      ],
    };
    const highBeam = { ...belt, partNumber: "RINRX2277", costPence: 500 };
    const dipped = { ...belt, partNumber: "RINRW477", costPence: 300 };

    it("charges both types when they pick different parts: separate parts", () => {
      const choices = new Map([[choiceKey("bulb", 107), { car_type_id: 1, node_id: "bulb", genart_id: 107, supplier: "aag" as const, part_number: "RINRW477", brand: null, description: null, chosen_at: PRICED_AT }]]);
      const result = priceJobParts({ jobs: [bulbJob], offers: new Map([[107, ok([dipped, highBeam])], [106, ok([highBeam])]]), choices });
      expect(result.ok && result.parts.map((p) => [p.genartId, p.partNumber])).toEqual([
        [107, "RINRW477"],
        [106, "RINRX2277"],
      ]);
    });

    it("charges once when two types with different lists pick the same part", () => {
      const result = priceJobParts({ jobs: [bulbJob], offers: new Map([[107, ok([highBeam])], [106, ok([highBeam, { ...dipped, buyable: false }])]]) });
      expect(result.ok && result.parts.map((p) => [p.genartId, p.partNumber])).toEqual([[107, "RINRX2277"]]);
    });

    it("keeps the quantity the car needs, never the sum of the repeats", () => {
      const pair = { ...belt, quantityOfFit: 2 };
      const result = priceJobParts({ jobs: [beltJob], offers: new Map([[10, ok([belt])], [305, ok([pair])]]) });
      expect(result.ok && result.parts.map((p) => [p.partNumber, p.quantity, p.linePence])).toEqual([["GAT5PK1650", 2, 3754]]);
    });

    it("leaves a type NAPA lists nothing for as a gap, as before", () => {
      const result = priceJobParts({ jobs: [beltJob], offers: new Map<number, AagPartOffers>([[10, { state: "empty", pricedAt: PRICED_AT }], [305, ok([belt])]]) });
      expect(result.ok).toBe(false);
      expect(result.parts.map((p) => p.genartId)).toEqual([305]);
    });

    it("charges both when the lists share nothing", () => {
      const other = { ...belt, partNumber: "OTHER" };
      const result = priceJobParts({ jobs: [beltJob], offers: new Map([[10, ok([belt])], [305, ok([other])]]) });
      expect(result.ok && result.parts.map((p) => p.partNumber)).toEqual(["GAT5PK1650", "OTHER"]);
    });

    it("keeps an admin's choice of a different part", () => {
      const other = { ...belt, partNumber: "OTHER" };
      const choices = new Map([
        [
          choiceKey("belt", 305),
          { car_type_id: 1, node_id: "belt", genart_id: 305, supplier: "aag" as const, part_number: "OTHER", brand: null, description: null, chosen_at: PRICED_AT },
        ],
      ]);
      const result = priceJobParts({ jobs: [beltJob], offers: new Map([[10, ok([belt])], [305, ok([belt, other])]]), choices });
      expect(result.ok && result.parts.map((p) => p.partNumber)).toEqual(["GAT5PK1650", "OTHER"]);
    });
  });

  it("carries a last known price through", () => {
    const result = priceJobParts({ jobs: [job], offers: new Map([[8, { ...filters, lastKnown: true }]]), uncharged: new Set([2021]) });
    expect(result.ok && result.parts[0].lastKnown).toBe(true);
  });

  describe("estimates (Task 72)", () => {
    const ranger = { reg: "S28BSW", carTypeId: 900, make: "FORD", modelLabel: "FORD Ranger" };
    const other = (reg: string, costPence: number, vehicle: { carTypeId: number; make: string; modelLabel: string } | null) => ({
      reg,
      genartId: 2021,
      offers: [{ ...filter, partNumber: `P-${reg}`, costPence }],
      vehicle,
    });
    const rangerCar = { carTypeId: 901, make: "FORD", modelLabel: "FORD Ranger" };
    const empty2021 = new Map<number, AagPartOffers>([
      [8, filters],
      [2021, { state: "empty", pricedAt: PRICED_AT }],
    ]);

    it("estimates a part AAG can't price from the closest similar car, dearest plus 15%", () => {
      const result = priceJobParts({
        jobs: [job],
        offers: empty2021,
        estimates: {
          vehicle: ranger,
          rows: new Map([
            [
              2021,
              [
                other("RANGER1", 4000, { carTypeId: 901, make: "FORD", modelLabel: "FORD Ranger" }),
                other("RANGER2", 5000, { carTypeId: 902, make: "FORD", modelLabel: "FORD Ranger" }),
                other("FIESTA", 9000, { carTypeId: 100, make: "FORD", modelLabel: "FORD Fiesta" }),
              ],
            ],
          ]),
        },
        now: PRICED_AT,
      });
      expect(result.ok).toBe(true);
      expect(result.parts[1]).toMatchObject({
        genartId: 2021,
        source: "estimate",
        supplier: null,
        partNumber: null,
        brand: null,
        unitPence: 5750,
        linePence: 5750,
        estimate: { basis: "model", samples: 2 },
        pricedAt: PRICED_AT,
      });
    });

    it("prefers an estimate to the admin's set price", () => {
      const result = priceJobParts({
        jobs: [job],
        offers: empty2021,
        setPrices: new Map([[2021, { pence: 100, setAt: PRICED_AT }]]),
        estimates: { vehicle: ranger, rows: new Map([[2021, [other("RANGER1", 1000, rangerCar)]]]) },
      });
      expect(result.ok && result.parts[1]).toMatchObject({ source: "estimate", linePence: 1150, estimate: { basis: "model" } });
    });

    it("never estimates from another model", () => {
      const result = priceJobParts({
        jobs: [job],
        offers: empty2021,
        estimates: { vehicle: ranger, rows: new Map([[2021, [other("FIESTA", 1000, { carTypeId: 100, make: "FORD", modelLabel: "FORD Fiesta" })]]]) },
      });
      expect(result.ok).toBe(false);
    });

    it("falls back to the set price when no car has a price", () => {
      const result = priceJobParts({
        jobs: [job],
        offers: empty2021,
        setPrices: new Map([[2021, { pence: 100, setAt: PRICED_AT }]]),
        estimates: { vehicle: ranger, rows: new Map() },
      });
      expect(result.ok && result.parts[1]).toMatchObject({ source: "set_price", linePence: 100 });
    });

    it("never estimates from the car's own answer", () => {
      const result = priceJobParts({
        jobs: [job],
        offers: empty2021,
        estimates: { vehicle: ranger, rows: new Map([[2021, [other("S28BSW", 1000, null)]]]) },
      });
      expect(result.ok).toBe(false);
    });

    it("marks the booking row and the customer line as estimated", () => {
      const result = priceJobParts({
        jobs: [job],
        offers: empty2021,
        estimates: { vehicle: ranger, rows: new Map([[2021, [other("RANGER1", 1000, rangerCar)]]]) },
      });
      const [, row] = catalogueBookingPartRows("b1", result.parts);
      expect(row).toMatchObject({ price_estimated: true, supplier: null, supplier_part_number: null, total_pence: 1150 });
      // Every row names the column: supabase-js would send NULL for a row that
      // left it out of a mixed insert, breaking its not-null (2026-11-23).
      const rows = catalogueBookingPartRows("b1", result.parts);
      expect(rows[0]).toMatchObject({ price_estimated: false });
      expect(new Set(rows.map((r) => Object.keys(r).sort().join(","))).size).toBe(1);
      expect(customerPartLines(result.parts).map((l) => l.estimated)).toEqual([false, true]);
    });
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
        price_estimated: false,
        fit_options: null,
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
      { nodeId: "discs", name: "Brake disc", brand: "BREMBO", position: "front", quantity: 2, unitPence: 4354, linePence: 8708, estimated: false },
    ]);
  });
});
