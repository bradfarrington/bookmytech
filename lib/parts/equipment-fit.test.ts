// Task 87: belts and other parts that depend on what the car has. The offers
// are NAPA's real answers (2026-11-27): KR65MHX (Peugeot 308 1.2, two belts),
// SW16PFD (Astra K 1.0, ±AC), KR05AJR (Transporter, chassis cut-off).

import { describe, expect, it } from "vitest";

import type { AagPartOffers } from "./aag-part-prices";
import { equipmentAsked, equipmentQuestions, priceJobParts, type PartsJob } from "./quote-parts";
import { selectJobParts } from "./repair-part-choice";
import {
  aagOffers,
  airConOf,
  builtInRange,
  carNotesOf,
  chassisFits,
  madeInFits,
  stopStartOf,
  vinYear,
  type SupplierOffer,
} from "./supplier-offer";

const PRICED_AT = "2026-11-27T08:00:00.000Z";

function belt(partNumber: string, costPence: number, extra: Partial<SupplierOffer> = {}): SupplierOffer {
  return {
    supplier: "aag",
    partNumber,
    description: "MICRO-V MULTI-RIBBED BELT",
    brand: "GATES",
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

const ok = (offers: SupplierOffer[]): AagPartOffers => ({ state: "ok", offers, pricedAt: PRICED_AT, lastKnown: false });

describe("reading NAPA's fitment", () => {
  it("reads air-con", () => {
    expect(airConOf("+AC")).toBe(true);
    expect(airConOf("-AC")).toBe(false);
    expect(airConOf("WITH AIR CONDITIONING")).toBe(true);
    expect(airConOf("NOT FOR A/C")).toBe(false);
    expect(airConOf("+AC +PAS")).toBe(true);
    expect(airConOf("FOR CARB")).toBeNull();
    expect(airConOf("")).toBeNull();
    expect(airConOf(null)).toBeNull();
  });

  it("reads stop-start", () => {
    expect(stopStartOf("FOR STOP-START")).toBe(true);
    expect(stopStartOf("NOT FOR STOP-START")).toBe(false);
    expect(stopStartOf("-AC")).toBeNull();
  });

  it("reads the VIN's model year nearest the car's year", () => {
    expect(vinYear("6", 2008)).toBe(2006);
    expect(vinYear("G", 2016)).toBe(2016);
    expect(vinYear("G", 1987)).toBe(1986);
    expect(vinYear("I", 2008)).toBeNull();
  });

  it("places a VW VIN against a chassis note", () => {
    const car = { vin: "WV1ZZZ7HZ6H079500", year: 2008 };
    expect(chassisFits("TO CH. 7H-6H079890", car)).toBe(true);
    expect(chassisFits("FROM CH. 7H-6H079891", car)).toBe(false);
    const later = { vin: "WV1ZZZ7HZ7H012345", year: 2008 };
    expect(chassisFits("TO CH. 7H-6H079890", later)).toBe(false);
    expect(chassisFits("FROM CH. 7H-6H079891", later)).toBe(true);
  });

  it("can't place a VIN of another model, plant or shape", () => {
    expect(chassisFits("TO CH. 7H-6H079890", { vin: "WVWZZZ1KZ6H079500", year: 2006 })).toBeNull();
    expect(chassisFits("TO CH. 7H-6H079890", { vin: "WV1ZZZ7HZ6X079500", year: 2006 })).toBeNull();
    expect(chassisFits("FOR LHD ONLY", { vin: "WV1ZZZ7HZ6H079500", year: 2006 })).toBeNull();
    expect(chassisFits("TO CH. 7H-6H079890", { vin: null })).toBeNull();
  });

  it("keeps the details on the offer", () => {
    const [offer] = aagOffers(
      [
        {
          article: "MICRO-V MULTI-RIBBED BELT",
          articleProvider: null,
          fittingPosition: null,
          imageUrl: null,
          requestLineId: null,
          productId: "GAT6PK1123",
          brand: "GATES",
          rating: "Best",
          costPence: 1500,
          surchargePence: null,
          minOrderQty: 1,
          sellable: true,
          lockout: null,
          displayOrder: 1,
          stock: [],
          totalQty: 0,
          quickest: null,
          properties: [
            { name: "Driven Unit", value: "Alternator" },
            { name: "Fitment", value: "-AC" },
            { name: "Chassis Note", value: "TO CH. 7H-6H079890" },
          ],
        },
      ],
      { vin: "WV1ZZZ7HZ6H079500", year: 2006 },
    );
    expect(offer).toMatchObject({
      drivenUnit: "Alternator",
      airCon: false,
      stopStart: null,
      fitmentText: "-AC",
      chassis: { note: "TO CH. 7H-6H079890", fits: true },
      readVersion: 4,
    });
  });
});

describe("which belt a job takes (Peugeot 308 1.2: two belts)", () => {
  const waterPump = belt("GAT3PK576SF", 1100, { drivenUnit: "Water pump", description: "MICRO-V MULTI-RIB STRETCH FIT BELT" });
  const alternator = belt("GAT6PK1043", 1666, { drivenUnit: "Alternator" });
  const offers = [waterPump, alternator];
  const picked = (job: string) => selectJobParts(job, offers, null).map((s) => (s.selection.source === "none" ? null : s.selection.offer.partNumber));

  it("takes the main belt for the ancillary drive belt", () => {
    expect(picked("Renew the ancillary drive belt")).toEqual(["GAT6PK1043"]);
  });

  it("takes the water pump belt for the coolant pump drive belt", () => {
    expect(picked("Renew the coolant pump drive belt")).toEqual(["GAT3PK576SF"]);
  });

  it("takes one of each for all the ancillary drive belts", () => {
    expect(picked("Renew all the ancillary drive belts")).toEqual(["GAT3PK576SF", "GAT6PK1043"]);
  });

  it("leaves other jobs alone", () => {
    // Not a drive-belt job: today's pick, the dearest.
    expect(picked("Renew the coolant pump")).toEqual(["GAT6PK1043"]);
  });

  it("charges both belts once each across the two belt part types", () => {
    const job: PartsJob = {
      nodeId: "belts",
      description: "Renew all the ancillary drive belts",
      groups: [
        { genartId: 10, label: "V-belt" },
        { genartId: 305, label: "V-ribbed belt" },
      ],
    };
    const result = priceJobParts({ jobs: [job], offers: new Map([[10, ok(offers)], [305, ok(offers)]]) });
    expect(result.ok && result.parts.map((p) => [p.partNumber, p.quantity])).toEqual([
      ["GAT3PK576SF", 1],
      ["GAT6PK1043", 1],
    ]);
  });
});

describe("air-con decides the belt (Astra K 1.0)", () => {
  const noAc = belt("GAT5PK1650", 1877, { drivenUnit: "Alternator", airCon: false, fitmentText: "-AC" });
  const withAc = belt("GAT5PK1680", 1920, { drivenUnit: "Alternator", airCon: true, fitmentText: "+AC" });
  const job: PartsJob = { nodeId: "belt", description: "Renew the ancillary drive belt", groups: [{ genartId: 305, label: "V-ribbed belt" }] };
  const offers = new Map([[305, ok([noAc, withAc])]]);

  it("prices the dearer and lists both for the mechanic when we don't know", () => {
    const result = priceJobParts({ jobs: [job], offers });
    expect(result.ok && result.parts).toHaveLength(1);
    const part = result.parts[0];
    expect(part).toMatchObject({ partNumber: "GAT5PK1680", linePence: 1920 });
    expect(part.fitOptions).toEqual({
      dependsOn: ["air_con"],
      options: [
        { supplier: "aag", partNumber: "GAT5PK1680", brand: "GATES", description: "MICRO-V MULTI-RIBBED BELT", for: { air_con: true }, label: "With air-con" },
        { supplier: "aag", partNumber: "GAT5PK1650", brand: "GATES", description: "MICRO-V MULTI-RIBBED BELT", for: { air_con: false }, label: "Without air-con" },
      ],
    });
    expect(equipmentQuestions(result.parts)).toEqual(["air_con"]);
  });

  it("takes the customer's answer", () => {
    const without = priceJobParts({ jobs: [job], offers, car: { sports: false, airCon: false } });
    expect(without.ok && without.parts.map((p) => [p.partNumber, p.linePence])).toEqual([["GAT5PK1650", 1877]]);
    // The mechanic still sees what to buy if the customer was wrong.
    expect(without.parts[0].fitOptions).toMatchObject({ dependsOn: ["air_con"], answered: { air_con: false } });
    expect(without.parts[0].fitOptions?.options.map((o) => o.partNumber)).toEqual(["GAT5PK1680", "GAT5PK1650"]);
    expect(equipmentQuestions(without.parts)).toEqual([]);
    expect(equipmentAsked(without.parts)).toEqual(["air_con"]);
    const withIt = priceJobParts({ jobs: [job], offers, car: { sports: false, airCon: true } });
    expect(withIt.ok && withIt.parts.map((p) => p.partNumber)).toEqual(["GAT5PK1680"]);
    expect(equipmentQuestions(withIt.parts)).toEqual([]);
  });

  it("counts a part that fits either in both", () => {
    const either = belt("GAT5PK1700", 2500, { drivenUnit: "Alternator" });
    const result = priceJobParts({ jobs: [job], offers: new Map([[305, ok([noAc, withAc, either])]]) });
    // Both kinds of car take the same part: nothing to tell apart, nothing to ask.
    expect(result.ok && result.parts.map((p) => [p.partNumber, p.fitOptions])).toEqual([["GAT5PK1700", undefined]]);
    expect(equipmentQuestions(result.parts)).toEqual([]);
  });

  it("asks nothing when the parts don't split", () => {
    const result = priceJobParts({ jobs: [job], offers: new Map([[305, ok([withAc])]]) });
    expect(result.ok && result.parts[0].fitOptions).toBeUndefined();
  });
});

describe("stop-start and chassis (Proace, Transporter)", () => {
  const job: PartsJob = { nodeId: "belt", description: "Renew the ancillary drive belt", groups: [{ genartId: 305, label: "V-ribbed belt" }] };

  it("splits on stop-start too", () => {
    const start = belt("GAT6PK1073EST", 3000, { stopStart: true });
    const plain = belt("GAT6PK1228", 2000, { stopStart: false });
    const result = priceJobParts({ jobs: [job], offers: new Map([[305, ok([start, plain])]]) });
    expect(result.ok && result.parts[0].fitOptions?.dependsOn).toEqual(["stop_start"]);
    expect(result.parts[0].fitOptions?.options.map((o) => o.label)).toEqual(["With stop-start", "Without stop-start"]);
  });

  it("drops the belts the VIN rules out, then asks about air-con", () => {
    const early = { note: "TO CH. 7H-6H079890", fits: true };
    const late = { note: "FROM CH. 7H-6H079891", fits: false };
    const offers = [
      belt("GAT6DPK1195", 4000, { airCon: true, chassis: early }),
      belt("GAT6DPK1215", 4100, { airCon: true, chassis: late }),
      belt("GAT6PK1123", 1500, { airCon: false, chassis: early }),
      belt("GAT6PK1138", 1600, { airCon: false, chassis: late }),
    ];
    const result = priceJobParts({ jobs: [job], offers: new Map([[305, ok(offers)]]) });
    expect(result.ok && result.parts[0].fitOptions?.options.map((o) => o.partNumber)).toEqual(["GAT6DPK1195", "GAT6PK1123"]);
    const answered = priceJobParts({ jobs: [job], offers: new Map([[305, ok(offers)]]), car: { sports: false, airCon: false } });
    expect(answered.ok && answered.parts.map((p) => p.partNumber)).toEqual(["GAT6PK1123"]);
  });
});

describe("car details only someone at the car can check (Task 87)", () => {
  const job: PartsJob = { nodeId: "pads", description: "Renew the rear brake pads", groups: [{ genartId: 402, label: "Brake pad set, disc brake" }] };
  const pad = (partNumber: string, costPence: number, notes: Array<{ text: string; fits: boolean | null }>) =>
    belt(partNumber, costPence, { description: "BRAKE PAD - REAR", carNotes: notes });

  it("reads NAPA's car details, leaving out what describes the part", () => {
    expect(
      carNotesOf(
        [
          { name: "Engine Code", value: "SPJC" },
          { name: "Vehicle Detail", value: "Engine Starts:360000;With start-stop function" },
          { name: "Applic Note", value: "(South Korea Production)" },
          { name: "Transmission Code", value: "MB6" },
          { name: "Year built", value: "To Dec 1, 2013 From Aug 1, 2009" },
          { name: "Size mm", value: "1650" },
        ],
        { vin: "U5YPH813SGL089445", registered: "2016-03-01" },
      ),
    ).toEqual([
      { text: "With start-stop function", fits: null },
      { text: "South Korea Production", fits: false },
      { text: "Gearbox MB6", fits: null },
      { text: "Built to Dec 1, 2013 from Aug 1, 2009", fits: false },
    ]);
  });

  it("places a registration against a year-built range, a year either side to be sure", () => {
    expect(builtInRange("To Dec 1, 2013", "2013-06-01")).toBe(true);
    expect(builtInRange("To Dec 1, 2013", "2014-03-01")).toBeNull();
    expect(builtInRange("To Dec 1, 2013", "2015-03-01")).toBe(false);
    expect(builtInRange("From Jun 1, 2017", "2017-02-01")).toBe(false);
    expect(builtInRange("From Jun 1, 2017", "2017-09-01")).toBeNull();
    expect(builtInRange("From Jun 1, 2017", "2019-01-01")).toBe(true);
    expect(builtInRange("From Jun 1, 2017", null)).toBeNull();
  });

  it("reads where the car was made from its VIN", () => {
    expect(madeInFits("Slovakia Production", "U5YPH813SGL089445")).toBe(true);
    expect(madeInFits("(South Korea Production)", "U5YPH813SGL089445")).toBe(false);
    expect(madeInFits("With Elec. H/B", "U5YPH813SGL089445")).toBeNull();
  });

  it("prices the dearer and lists each version for the mechanic, never asking the customer", () => {
    const without = pad("BREP30051", 2000, [{ text: "Without Elec. H/B", fits: null }]);
    const withEhb = pad("BREP30067", 2600, [{ text: "With Elec. H/B", fits: null }]);
    const result = priceJobParts({ jobs: [job], offers: new Map([[402, ok([without, withEhb])]]) });
    expect(result.ok && result.parts.map((p) => [p.partNumber, p.linePence])).toEqual([["BREP30067", 2600]]);
    expect(result.parts[0].fitOptions).toMatchObject({ dependsOn: ["car"] });
    expect(result.parts[0].fitOptions?.options.map((o) => [o.label, o.partNumber])).toEqual([
      ["Without Elec. H/B", "BREP30051"],
      ["With Elec. H/B", "BREP30067"],
    ]);
    expect(equipmentQuestions(result.parts)).toEqual([]);
    expect(equipmentAsked(result.parts)).toEqual([]);
  });

  it("drops the versions the car's registration or VIN rules out", () => {
    const old = pad("OLD", 3000, [{ text: "Built to Dec 1, 2013", fits: false }]);
    const current = pad("NEW", 2000, [{ text: "Built from Dec 1, 2013", fits: true }]);
    const result = priceJobParts({ jobs: [job], offers: new Map([[402, ok([old, current])]]) });
    expect(result.ok && result.parts.map((p) => [p.partNumber, p.fitOptions])).toEqual([["NEW", undefined]]);
  });

  it("counts a part with no car detail as fitting any car", () => {
    const sport = pad("SPORT", 3000, [{ text: "Sport Models", fits: null }]);
    const plain = pad("PLAIN", 2000, []);
    const result = priceJobParts({ jobs: [job], offers: new Map([[402, ok([sport, plain])]]) });
    expect(result.parts[0].fitOptions?.options.map((o) => [o.label, o.partNumber])).toEqual([
      ["Sport Models", "SPORT"],
      ["Any other", "PLAIN"],
    ]);
  });
});
