import { describe, expect, it } from "vitest";

import type { AagQuoteClassicOutcome, AagQuoteOutcome } from "@/lib/aag/client";
import { classicFit, classicNeedsEngineCode, engineCodes, engineCodesOf, unambiguousClassic } from "@/lib/aag/quote";
import type { AagClassicProduct, AagQuoteBody, AagQuoteClassicBody } from "@/lib/aag/types";
import { fetchAagLiveOffers, type AagLookups } from "./aag-live-offers";
import { ENGINE_CODE_PROBE_GENARTS, engineCodeSource } from "./engine-codes";

// NAPA's full catalogue for S28BSW (2024 Ranger 3.0, engine BF2X), live 2026-11-17.
const HEAD_BOLTS: AagClassicProduct = {
  productId: "RNZ14-32344-01",
  costPrice: 37.48,
  fitment: "",
  productDetails: [
    { name: "Bolt Head-/Nut Design", value: "External Hexagon" },
    { name: "Length [mm]", value: "160" },
    { name: "Thread Size", value: "M13" },
    { name: "TecDoc Engine Number", value: "BF2X" },
    { name: "Required quantity", value: "2" },
  ],
};
const CRANK_SEAL_REAR: AagClassicProduct = {
  productId: "RNZ81-90050-00",
  costPrice: 28.12,
  fitment: "Transmission sided",
  productDetails: [
    { name: "Fitting Position", value: "Transmission sided" },
    { name: "TecDoc Engine Number", value: "BF2X" },
  ],
};
const CRANK_SEAL_FRONT: AagClassicProduct = {
  productId: "RNZ81-34316-00",
  costPrice: 8.72,
  fitment: "Frontal sided",
  productDetails: [
    { name: "Fitting Position", value: "Frontal sided" },
    { name: "TecDoc Engine Number", value: "BF2X" },
  ],
};
const OTHER_ENGINE: AagClassicProduct = {
  productId: "RNZ14-99999-01",
  costPrice: 30,
  fitment: "",
  productDetails: [{ name: "TecDoc Engine Number", value: "YN2X, P5AT" }],
};

const quoteWithCodes = (...values: string[]): AagQuoteBody => ({
  Articles: values.map((value) => ({ ArticleProperties: [{ Name: "Engine Code", Value: value }] })),
});

describe("engineCodes / engineCodesOf: the car's engine as NAPA's exact-match answer gives it", () => {
  it("reads one code, a list, and a code with its other name in brackets", () => {
    expect(engineCodes("BF2X")).toEqual(["BF2X"]);
    expect(engineCodes("yn2x, P5AT")).toEqual(["YN2X", "P5AT"]);
    expect(engineCodes("S55B30T0 (S55B30A)")).toEqual(["S55B30T0", "S55B30A"]);
    expect(engineCodes("")).toEqual([]);
  });

  it("collects every name the answer uses for the car's engine", () => {
    expect(engineCodesOf(quoteWithCodes("BF2X", "BF2X"))).toEqual(["BF2X"]);
    expect(engineCodesOf(quoteWithCodes("S55B30T0 (S55B30A)"))).toEqual(["S55B30A", "S55B30T0"]);
  });

  it("skips an article that lists two different engines", () => {
    expect(engineCodesOf(quoteWithCodes("BF2X, YN2X"))).toEqual([]);
  });

  it("is empty when NAPA gives no code (a Tesla)", () => {
    expect(engineCodesOf({ Articles: [{ ArticleProperties: [{ Name: "Fuel", Value: "Electric" }] }] })).toEqual([]);
    expect(engineCodesOf(null)).toEqual([]);
  });
});

describe("classicFit: engine codes settled from NAPA's own data (Task 77)", () => {
  it("fits a part whose only condition is the car's own engine", () => {
    expect(classicFit(HEAD_BOLTS, ["BF2X"])).toBe("fits");
  });

  it("is unsure while the car's engine isn't known", () => {
    expect(classicFit(HEAD_BOLTS, [])).toBe("unsure");
  });

  it("says a part for other engines doesn't fit", () => {
    expect(classicFit(OTHER_ENGINE, ["BF2X"])).toBe("other_engine");
    expect(classicFit(OTHER_ENGINE, ["P5AT"])).toBe("fits");
  });

  it("is unsure when there's another condition beside the engine", () => {
    const rearDiscs: AagClassicProduct = {
      productDetails: [
        { name: "TecDoc Engine Number", value: "BF2X" },
        { name: "Braking System", value: "For vehicles with disc brakes on the rear axle" },
      ],
    };
    expect(classicFit(rearDiscs, ["BF2X"])).toBe("unsure");
  });

  it("never settles an engine named in free text rather than as an engine number", () => {
    expect(classicFit({ productDetails: [{ name: "Suitable For", value: "TecDoc Engine Number SPJA" }] }, ["SPJA"])).toBe("unsure");
  });

  it("is unsure about a part placed by end or side rather than axle, whatever the engine", () => {
    expect(classicFit(CRANK_SEAL_REAR, ["BF2X"])).toBe("unsure");
    expect(classicFit(CRANK_SEAL_FRONT, ["BF2X"])).toBe("unsure");
    expect(classicFit({ fitment: "Transmission sided" }, [])).toBe("unsure");
  });

  it("knows which answers turn on the engine code", () => {
    expect(classicNeedsEngineCode({ products: [HEAD_BOLTS] })).toBe(true);
    expect(classicNeedsEngineCode({ products: [CRANK_SEAL_FRONT] })).toBe(false);
    expect(classicNeedsEngineCode({ products: [{ productId: "X" }] })).toBe(false);
  });
});

describe("unambiguousClassic with the car's engine codes", () => {
  it("keeps the Ranger's head bolts once its engine is known, and not before", () => {
    expect(unambiguousClassic({ products: [HEAD_BOLTS] }, ["BF2X"]).products).toEqual([HEAD_BOLTS]);
    expect(unambiguousClassic({ products: [HEAD_BOLTS] }).products).toEqual([]);
  });

  it("leaves out parts for other engines and keeps the car's", () => {
    expect(unambiguousClassic({ products: [HEAD_BOLTS, OTHER_ENGINE] }, ["BF2X"]).products).toEqual([HEAD_BOLTS]);
  });

  it("never picks between the two crankshaft seals: which end depends on the job", () => {
    expect(unambiguousClassic({ products: [CRANK_SEAL_REAR, CRANK_SEAL_FRONT] }, ["BF2X"]).products).toEqual([]);
  });
});

function fakeQuote(answers: Record<number, AagQuoteOutcome>) {
  const asked: number[] = [];
  const quote = (async (_reg: string, genart: string | number) => {
    asked.push(Number(genart));
    return answers[Number(genart)] ?? { kind: "no_parts" };
  }) as AagLookups["quote"];
  return { quote, asked };
}

/** A Supabase stand-in for `aag_engine_codes`: one row per reg. */
function fakeDb(rows: Record<string, string[]> = {}, opts: { missing?: boolean } = {}) {
  const writes: Array<{ reg: string; codes: string[] }> = [];
  const db = {
    from: () => ({
      select: () => ({
        eq: (_col: string, reg: string) => ({
          maybeSingle: async () =>
            opts.missing
              ? { data: null, error: { code: "PGRST205", message: "missing" } }
              : { data: rows[reg] ? { codes: rows[reg] } : null, error: null },
        }),
      }),
      upsert: async (row: { reg: string; codes: string[] }) => {
        writes.push(row);
        rows[row.reg] = row.codes;
        return { error: null };
      },
    }),
  };
  return { db: db as never, writes, rows };
}

describe("engineCodeSource", () => {
  it("uses codes already stored for the car, asking NAPA nothing", async () => {
    const { quote, asked } = fakeQuote({});
    const source = engineCodeSource("S28 BSW", { db: fakeDb({ S28BSW: ["BF2X"] }).db, quote });
    expect(await source.get()).toEqual(["BF2X"]);
    expect(asked).toEqual([]);
  });

  it("asks for the oil and air filters once when nothing is known, and stores what they say", async () => {
    const { quote, asked } = fakeQuote({
      7: { kind: "ok", body: quoteWithCodes("C14HDEZ") },
      8: { kind: "ok", body: quoteWithCodes("C14HDEZ") },
    });
    const store = fakeDb();
    const source = engineCodeSource("FN60KYP", { db: store.db, quote });
    const [a, b] = await Promise.all([source.get(), source.get()]);
    expect(a).toEqual(["C14HDEZ"]);
    expect(b).toEqual(["C14HDEZ"]);
    expect(asked.sort()).toEqual([...ENGINE_CODE_PROBE_GENARTS].sort());
    await source.settled();
    expect(store.rows.FN60KYP).toEqual(["C14HDEZ"]);
  });

  it("adds codes seen in later answers to the ones stored", async () => {
    const store = fakeDb({ FN60KYP: ["C14HDEZ"] });
    const source = engineCodeSource("FN60KYP", { db: store.db, quote: fakeQuote({}).quote });
    source.seen(["SPJC"]);
    await source.settled();
    expect(store.rows.FN60KYP).toEqual(["C14HDEZ", "SPJC"]);
    expect(await source.get()).toEqual(["C14HDEZ", "SPJC"]);
  });

  it("doesn't write when nothing new was seen", async () => {
    const store = fakeDb({ S28BSW: ["BF2X"] });
    const source = engineCodeSource("S28BSW", { db: store.db, quote: fakeQuote({}).quote });
    source.seen(["BF2X"]);
    await source.settled();
    expect(store.writes).toEqual([]);
  });

  it("still works, unstored, before the table exists", async () => {
    const store = fakeDb({}, { missing: true });
    const { quote } = fakeQuote({ 7: { kind: "ok", body: quoteWithCodes("BF2X") } });
    const source = engineCodeSource("S28BSW", { db: store.db, quote });
    expect(await source.get()).toEqual(["BF2X"]);
    await source.settled();
    expect(store.writes).toEqual([]);
  });

  it("is empty when NAPA gives no code", async () => {
    const source = engineCodeSource("BN20MPO", { quote: fakeQuote({}).quote });
    expect(await source.get()).toEqual([]);
  });
});

describe("fetchAagLiveOffers prices engine-limited catalogue parts (Task 77)", () => {
  const lookups = (quote: AagQuoteOutcome, classic: AagQuoteClassicOutcome): AagLookups => ({
    quote: async () => quote,
    classic: async () => classic,
  });

  it("prices the Ranger's head bolts from the catalogue once its engine code is known", async () => {
    const source = engineCodeSource("S28BSW", { quote: fakeQuote({ 7: { kind: "ok", body: quoteWithCodes("BF2X") } }).quote });
    const result = await fetchAagLiveOffers(
      "S28BSW",
      1217,
      { engineCodes: source },
      lookups({ kind: "failed", reason: "ISE0047" }, { kind: "ok", body: { products: [HEAD_BOLTS] } as AagQuoteClassicBody }),
    );
    expect(result).toMatchObject({ kind: "ok", from: "classic" });
    if (result.kind === "ok") expect(result.offers.map((o) => o.partNumber)).toEqual(["RNZ14-32344-01"]);
  });

  it("drops them, as before, without the car's engine codes", async () => {
    const result = await fetchAagLiveOffers(
      "S28BSW",
      1217,
      {},
      lookups({ kind: "failed", reason: "ISE0047" }, { kind: "ok", body: { products: [HEAD_BOLTS] } }),
    );
    expect(result).toEqual({ kind: "no_parts" });
  });

  it("learns the car's engine codes from every standard quote with parts", async () => {
    const source = engineCodeSource("S28BSW", { quote: fakeQuote({}).quote });
    await fetchAagLiveOffers(
      "S28BSW",
      82,
      { engineCodes: source },
      lookups(
        { kind: "ok", body: { Articles: [{ ArticleProperties: [{ Name: "Engine Code", Value: "BF2X" }], ProductOptions: [{ ProductId: "P1", CostPrice: 10 }] }] } },
        { kind: "no_parts" },
      ),
    );
    expect(await source.get()).toEqual(["BF2X"]);
  });

  it("doesn't ask for the engine when no catalogue part depends on it", async () => {
    const { quote, asked } = fakeQuote({});
    const source = engineCodeSource("S28BSW", { quote });
    await fetchAagLiveOffers(
      "S28BSW",
      4,
      { engineCodes: source },
      lookups({ kind: "no_parts" }, { kind: "ok", body: { products: [{ productId: "AUTAEG1691", costPrice: 5 }] } }),
    );
    expect(asked).toEqual([]);
  });
});
