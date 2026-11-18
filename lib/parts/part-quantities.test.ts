// How many of which part a job buys (Task 78). Gareth, 2026-11-18: repairs
// listing several parts charged one, and spark and glow plugs charged one plug
// whatever the engine. The NAPA answers below are trimmed from live replies
// captured 2026-11-18 (read-only lookups).

import { describe, expect, it } from "vitest";

import { flattenQuote } from "@/lib/aag/quote";
import type { AagArticle, AagQuoteBody } from "@/lib/aag/types";
import type { AagPartOffers } from "./aag-part-prices";
import { priceJobParts, type PartsJob } from "./quote-parts";
import { jobNeeds, selectJobParts } from "./repair-part-choice";
import { aagOffers, cylinderOf, perVehicleOf, positionOf, sideOf, type SupplierOffer } from "./supplier-offer";

const PRICED_AT = "2026-11-18T10:00:00.000Z";

function article(
  description: string,
  fittingPosition: string,
  properties: Record<string, string>,
  options: Array<{ id: string; brand: string; rating: string; pounds: number; minQty?: number }>,
): AagArticle {
  return {
    ArticleDescription: description,
    FittingPosition: fittingPosition,
    ArticleProperties: Object.entries(properties).map(([Name, Value]) => ({ Name, Value })),
    ProductOptions: options.map((o, i) => ({
      ProductId: o.id,
      Brand: o.brand,
      BrandRating: o.rating,
      RecMinOrdQty: o.minQty ?? 1,
      CostPrice: o.pounds,
      CustomerLockoutRating: "OK FOR SUPPLY",
      DisplayOrder: i + 1,
    })),
  };
}

const offersOf = (...articles: AagArticle[]): SupplierOffer[] =>
  aagOffers(flattenQuote({ Articles: articles } satisfies AagQuoteBody));

/** What a job buys: part number × quantity, in slot order. */
function bought(job: string, offers: SupplierOffer[]): string[] {
  return selectJobParts(job, offers, null).map(({ selection, quantity }) =>
    selection.source === "none" ? "none" : `${selection.offer.partNumber}×${quantity}`,
  );
}

// FN60KYP, 2010 Fiesta 1.4 petrol: one plug article, "No of Plugs" 4.
const fiestaPlugs = offersOf(
  article("(TR5B-13) SPARK PLUG", "", { "No of Plugs": "4", "Engine Code": "SPJA", Position: "" }, [
    { id: "NGK4559", brand: "NGK", rating: "Best", pounds: 4.81 },
  ]),
);

// CX14RNY, 2014 Leon 2.0 TDI: three ordinary glow plugs and a pressure-sensor one on cylinder 3.
const leonGlowPlugs = offersOf(
  article("(Y1002AS) GLOW PLUG", "", { "No of Plugs": "3", "Part Note": "(Excl. pressure sensor type)" }, [
    { id: "BSC0250403009", brand: "BOSCH", rating: "Better", pounds: 13.37 },
    { id: "NGK8926", brand: "NGK", rating: "Best", pounds: 12.85 },
  ]),
  article("Y1078PS  GLOW PLUG", "", { "No of Plugs": "1", Position: "Cyl. 3", "Part Note": "Pressure sensor type" }, [
    { id: "NGK90329", brand: "NGK", rating: "Best", pounds: 104.88 },
  ]),
);

// BA18MVO, 2018 Civic: separate left and right front struts, one rear shock for either side.
const civicShocks = offersOf(
  article("SHOCK ABS GAS FRONT (LH)", "FR LH", {}, [{ id: "KYB3340331", brand: "KYB", rating: "Best", pounds: 79.46 }]),
  article("SHOCK ABS GAS FRONT (RH)", "FR RH", {}, [{ id: "KYB3340330", brand: "KYB", rating: "Best", pounds: 79.46 }]),
  article("SHOCK ABS GAS REAR", "RR", {}, [
    { id: "NPANSA2048", brand: "NAPA", rating: "Better", pounds: 59.43 },
    { id: "KYB3430036", brand: "KYB", rating: "Best", pounds: 58.59 },
  ]),
);

// S28BSW, 2024 Ranger: a blade set, or a driver's and a passenger's blade.
const rangerWipers = offersOf(
  article("(A350S) AEROTWIN FLAT BLADE SET 650/400", "FR", { Qty: "Kit" }, [
    { id: "BSC3397014350", brand: "BOSCH", rating: "Best", pounds: 28.02 },
  ]),
  article("(AP18U) AEROTWIN PLUS FLAT BLADE 450", "FR PS", {}, [
    { id: "BSC3397006831", brand: "BOSCH", rating: "Best", pounds: 14.36 },
  ]),
  article("(AP24U) AEROTWIN PLUS FLAT BLADE 600", "FR DS", {}, [
    { id: "BSC3397006837", brand: "BOSCH", rating: "Best", pounds: 15.63 },
  ]),
);

describe("reading NAPA's answer", () => {
  it("reads the side from the fitting position, else the description", () => {
    expect(sideOf("FR LH", "SHOCK ABS GAS FRONT (LH)")).toBe("left");
    expect(sideOf("FR RH", null)).toBe("right");
    expect(sideOf("FR DS", "(AP24U) AEROTWIN PLUS FLAT BLADE 600")).toBe("driver");
    expect(sideOf("FR PS", null)).toBe("passenger");
    expect(sideOf("", "Tie Rod End Front Axle Left (TA3239)")).toBe("left");
    expect(sideOf("RR", "Apec Brake Caliper Surcharge Free (Rear R/H)")).toBe("right");
  });

  it("names no side for a part that fits either, or none", () => {
    expect(sideOf("FR", "Bump Stop Front Axle Left, Front Axle Right (172141)")).toBeNull();
    expect(sideOf("RR", "SHOCK ABS GAS REAR")).toBeNull();
    // "PS" in a description is as likely power steering as passenger side.
    expect(sideOf("", "PS PUMP")).toBeNull();
    expect(sideOf("", "HEADLAMP (TRUHL2246)")).toBeNull();
  });

  it("still reads the axle when the side follows it", () => {
    expect(positionOf("FR LH", null)).toBe("front");
    expect(positionOf("FR DS", "(AP24U) AEROTWIN PLUS FLAT BLADE 600")).toBe("front");
    expect(positionOf("RR", null)).toBe("rear");
  });

  it("reads how many plugs the car has, and a plug's own cylinder", () => {
    expect(perVehicleOf([{ name: "No of Plugs", value: "4" }])).toBe(4);
    expect(perVehicleOf([{ name: "Required quantity", value: "3" }])).toBe(3);
    expect(perVehicleOf([{ name: "Qty", value: "Kit" }])).toBeNull();
    expect(perVehicleOf([])).toBeNull();
    expect(cylinderOf([{ name: "Position", value: "Cyl. 3" }])).toBe("Cyl. 3");
    expect(cylinderOf([{ name: "Position", value: "" }])).toBeNull();
    expect(fiestaPlugs[0]).toMatchObject({ perVehicle: 4, cylinder: null, side: null, fitRead: true });
  });
});

describe("jobNeeds", () => {
  it("reads HaynesPro's wording", () => {
    expect(jobNeeds("Renew both front shock absorbers")).toEqual({ side: null, count: "both", plural: true });
    expect(jobNeeds("Renew all the glow plugs")).toMatchObject({ count: "all", plural: true });
    expect(jobNeeds("Renew the glow plug")).toEqual({ side: null, count: null, plural: false });
    expect(jobNeeds("Renew the front left shock absorber")).toMatchObject({ side: "left", plural: false });
    expect(jobNeeds("Renew two tail light bulbs")).toMatchObject({ count: "both" });
    expect(jobNeeds("Renew one tail light bulb")).toMatchObject({ count: "one" });
    expect(jobNeeds("Renew the right xenon headlight bulb (follow the safety notes)")).toMatchObject({
      side: "right",
      plural: false,
    });
    expect(jobNeeds("Renew the glow plug relay").plural).toBe(false);
    expect(jobNeeds("Renew the spark plugs").plural).toBe(true);
  });
});

describe("plugs", () => {
  it("buys every spark plug the engine has", () => {
    expect(bought("Renew the spark plugs", fiestaPlugs)).toEqual(["NGK4559×4"]);
    expect(bought("Renew all the spark plugs", fiestaPlugs)).toEqual(["NGK4559×4"]);
  });

  it("buys one plug for a one-plug job", () => {
    expect(bought("Renew the spark plug", fiestaPlugs)).toEqual(["NGK4559×1"]);
  });

  it("buys the ordinary glow plugs and the pressure-sensor one together", () => {
    expect(bought("Renew all the glow plugs", leonGlowPlugs)).toEqual(["NGK8926×3", "NGK90329×1"]);
  });

  it("buys one ordinary glow plug for a one-plug job, never the sensor plug", () => {
    expect(bought("Renew the glow plug", leonGlowPlugs)).toEqual(["NGK8926×1"]);
  });
});

describe("sides", () => {
  it("buys a left and a right part for a job on both sides", () => {
    expect(bought("Renew both front shock absorbers", civicShocks)).toEqual(["KYB3340331×1", "KYB3340330×1"]);
  });

  it("buys only the side a job names", () => {
    expect(bought("Renew the front left shock absorber", civicShocks)).toEqual(["KYB3340331×1"]);
    expect(bought("Renew the front right shock absorber", civicShocks)).toEqual(["KYB3340330×1"]);
  });

  it("buys two of a part NAPA lists once for either side, on a job on both sides", () => {
    expect(bought("Renew both rear shock absorbers", civicShocks)).toEqual(["KYB3430036×2"]);
    expect(bought("Renew the rear left shock absorber", civicShocks)).toEqual(["KYB3430036×1"]);
  });

  it("buys a driver's and a passenger's blade rather than one", () => {
    expect(bought("Renew the front wiper blades", rangerWipers)).toEqual(["BSC3397006837×1", "BSC3397006831×1"]);
  });

  it("buys either side for a job wanting one", () => {
    const lamps = offersOf(
      article("REAR LAMP (TRULL7290)", "RR LH", {}, [{ id: "L", brand: "TRU", rating: "Best", pounds: 50 }]),
      article("REAR LAMP (TRULL7291)", "RR RH", {}, [{ id: "R", brand: "TRU", rating: "Best", pounds: 50 }]),
    );
    expect(bought("Renew one tail light", lamps)).toHaveLength(1);
  });
});

describe("unchanged", () => {
  it("still picks one of several alternatives", () => {
    const batteries = offersOf(
      article("(AFB027N) NAPA Battery EFB STOP START 12V 60AH 560CCA", "", {}, [
        { id: "AFB027N", brand: "NAPA", rating: "Best", pounds: 80 },
      ]),
      article("(AGM027N) NAPA Battery AGM STOP START 12V 60AH 680CCA", "", {}, [
        { id: "AGM027N", brand: "NAPA", rating: "Best", pounds: 120 },
      ]),
    );
    expect(bought("Renew the battery", batteries)).toEqual(["AGM027N×1"]);
  });

  it("keeps a pair of discs at two on a job on both sides", () => {
    const discs = offersOf(
      article("BRAKE DISC PAIR (PRICE PER DISC) - FRONT", "FR", {}, [
        { id: "DISC", brand: "Mintex", rating: "Best", pounds: 30, minQty: 2 },
      ]),
    );
    expect(bought("Renew the front brake discs", discs)).toEqual(["DISC×2"]);
    expect(bought("Renew both front brake discs", discs)).toEqual(["DISC×2"]);
  });

  it("keeps one front and one rear set for a job naming no axle", () => {
    const pads = offersOf(
      article("PADS FRONT", "FR", {}, [{ id: "F", brand: "A", rating: "Best", pounds: 30 }]),
      article("PADS REAR", "RR", {}, [{ id: "R", brand: "A", rating: "Best", pounds: 25 }]),
    );
    expect(bought("Renew the brake pads", pads)).toEqual(["F×1", "R×1"]);
  });
});

describe("priceJobParts", () => {
  const price = (description: string, genartId: number, offers: SupplierOffer[]) =>
    priceJobParts({
      jobs: [{ nodeId: "job", description, groups: [{ genartId, label: "Part" }] } satisfies PartsJob],
      offers: new Map<number, AagPartOffers>([[genartId, { state: "ok", offers, pricedAt: PRICED_AT, lastKnown: false }]]),
    });
  const total = (result: ReturnType<typeof priceJobParts>) => result.parts.reduce((n, p) => n + p.linePence, 0);

  it("prices every glow plug on the Leon: 3 × £12.85 + £104.88", () => {
    const result = price("Renew all the glow plugs", 243, leonGlowPlugs);
    expect(result.ok).toBe(true);
    expect(total(result)).toBe(3 * 1285 + 10488);
  });

  it("prices four spark plugs on the Fiesta", () => {
    const result = price("Renew the spark plugs", 686, fiestaPlugs);
    expect(result.parts).toMatchObject([{ quantity: 4, unitPence: 481, linePence: 1924 }]);
  });

  it("prices both front shocks, each with its side", () => {
    const result = price("Renew both front shock absorbers", 854, civicShocks);
    expect(result.parts).toMatchObject([
      { side: "left", position: "front", linePence: 7946 },
      { side: "right", position: "front", linePence: 7946 },
    ]);
  });
});
