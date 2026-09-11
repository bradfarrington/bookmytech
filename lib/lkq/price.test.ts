import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  basePartNoOf,
  cheapestVariant,
  dearestVariant,
  isBuyable,
  isNotFound,
  parseMoneyPence,
  parseStock,
  priceLadder,
  splitParts,
  stockLevels,
  stripSupersession,
  totalStock,
} from "./price";
import type { LkqPriceRow } from "./types";
import { extractSoapResult, parseXml } from "./xml";

const row = (over: Partial<LkqPriceRow> = {}): LkqPriceRow => ({
  supplierPartNo: "104590266",
  basePartNo: "10459026",
  shortCode: "",
  description: "FRONT DISC",
  supersededTo: null,
  brand: "TEXTAR",
  quality: "OES",
  qualityDesc: "OES",
  showPricePence: 3167,
  retailPricePence: 7642,
  net1PricePence: 7642,
  surchargePence: null,
  branchFree: null,
  buddyFree: null,
  rdcFree: null,
  ndcFree: null,
  companyFree: null,
  ...over,
});

describe("parseMoneyPence", () => {
  it("converts decimal pounds to integer pence", () => {
    expect(parseMoneyPence("31.67")).toBe(3167);
    expect(parseMoneyPence("216.20")).toBe(21620);
  });

  it("keeps 0.00 as 0 — for RRP that means 'no published price', not 'missing'", () => {
    expect(parseMoneyPence("0.00")).toBe(0);
  });

  it("returns null for blank or junk", () => {
    expect(parseMoneyPence("")).toBeNull();
    expect(parseMoneyPence("   ")).toBeNull();
    expect(parseMoneyPence("abc")).toBeNull();
    expect(parseMoneyPence(null)).toBeNull();
  });

  it("does not accumulate float error", () => {
    expect(parseMoneyPence("39.22")).toBe(3922);
    expect(parseMoneyPence("8.10")).toBe(810);
    expect(parseMoneyPence("0.38")).toBe(38);
  });
});

describe("parseStock", () => {
  it("returns NULL for a blank figure, never 0", () => {
    // 101690288 comes back with every level blank; 333330020 reports NDCFree 195.
    // Rendering blank as "0 in stock" would tell a mechanic something untrue.
    expect(parseStock("")).toBeNull();
    expect(parseStock(null)).toBeNull();
    expect(parseStock("195")).toBe(195);
  });

  it("keeps a genuine zero, because that IS an answer", () => {
    expect(parseStock("0")).toBe(0);
  });
});

describe("stripSupersession", () => {
  it("pulls the replacement part out of the description free text", () => {
    expect(stripSupersession("S/S TO 104592468")).toEqual({
      description: "",
      supersededTo: "104592468",
    });
    expect(stripSupersession("FRONT DISC S/S TO 104592469")).toEqual({
      description: "FRONT DISC",
      supersededTo: "104592469",
    });
  });

  it("leaves an ordinary description alone", () => {
    expect(stripSupersession("FRONT B/PAD SET MISTUBISHI L200")).toEqual({
      description: "FRONT B/PAD SET MISTUBISHI L200",
      supersededTo: null,
    });
  });
});

describe("basePartNoOf", () => {
  it("takes the first 8 characters, whatever the 9th is", () => {
    // The 9th character is a brand suffix and may be a digit OR a letter.
    expect(basePartNoOf("104590266")).toBe("10459026");
    expect(basePartNoOf("10459026A")).toBe("10459026");
    expect(basePartNoOf("10459026X")).toBe("10459026");
    expect(basePartNoOf("10459026")).toBe("10459026");
  });
});

describe("isNotFound — the £0.00 trap", () => {
  it("catches the shape LKQ returns for an unknown part", () => {
    // Status 0, blank description, ShowPrice "0.00", empty Retail/Net1.
    // Code 107 "Product not found" is NEVER returned.
    expect(
      isNotFound(
        row({
          supplierPartNo: "000000000",
          description: "",
          brand: null,
          quality: null,
          showPricePence: 0,
          retailPricePence: null,
          net1PricePence: null,
        }),
      ),
    ).toBe(true);
  });

  it("does NOT flag a real part whose RRP is simply unpublished", () => {
    // 10459026W is a genuine Brembo Max disc at £60.93 with RetailPrice 0.00.
    // This asymmetry is the whole point: a description means it is real.
    expect(
      isNotFound(
        row({
          supplierPartNo: "10459026W",
          description: "FRONT DISC FOCUS/C-MAX & VOLVO V50",
          brand: "BREMBO MAX",
          showPricePence: 6093,
          retailPricePence: 0,
          net1PricePence: 0,
        }),
      ),
    ).toBe(false);
  });
});

describe("isBuyable", () => {
  it("treats an unpriced variant as not sellable on this account", () => {
    expect(isBuyable(row({ showPricePence: 3167 }))).toBe(true);
    expect(isBuyable(row({ showPricePence: null }))).toBe(false);
    expect(isBuyable(row({ showPricePence: 0 }))).toBe(false);
  });
});

describe("stock helpers", () => {
  it("totals only when at least one figure was given", () => {
    expect(totalStock(row())).toBeNull();
    expect(totalStock(row({ ndcFree: 195, companyFree: 421 }))).toBe(616);
    expect(totalStock(row({ branchFree: 0 }))).toBe(0);
  });

  it("names the five levels in branch-first order", () => {
    expect(stockLevels(row({ branchFree: 6 })).map((l) => l.label)).toEqual([
      "Branch",
      "Buddy",
      "RDC",
      "NDC",
      "Company",
    ]);
  });
});

describe("priceLadder", () => {
  const rows = [
    row({ supplierPartNo: "10459026X", brand: "BREMBO XTR", showPricePence: 6690 }),
    row({ supplierPartNo: "104590266", brand: "TEXTAR", showPricePence: 3167 }),
    row({ supplierPartNo: "10459026S", brand: "STARLINE", showPricePence: null }),
    row({ supplierPartNo: "104590268", brand: "PAGID", showPricePence: 4747 }),
  ];

  it("groups variants under one catalogue part, cheapest first", () => {
    const ladder = priceLadder(rows);
    expect(ladder.size).toBe(1);
    const variants = ladder.get("10459026") as LkqPriceRow[];
    expect(variants.map((v) => v.brand)).toEqual(["TEXTAR", "PAGID", "BREMBO XTR", "STARLINE"]);
  });

  it("keeps unbuyable variants but sorts them last", () => {
    const variants = priceLadder(rows).get("10459026") as LkqPriceRow[];
    expect(variants.at(-1)?.brand).toBe("STARLINE");
    expect(variants).toHaveLength(4);
  });

  it("separates genuinely different catalogue parts", () => {
    const ladder = priceLadder([...rows, row({ supplierPartNo: "104660757", basePartNo: "10466075" })]);
    expect([...ladder.keys()].sort()).toEqual(["10459026", "10466075"]);
  });
});

describe("cheapestVariant / dearestVariant", () => {
  const rows = [
    row({ supplierPartNo: "104590266", showPricePence: 3167 }),
    row({ supplierPartNo: "10459026X", showPricePence: 6690 }),
    row({ supplierPartNo: "10459026S", showPricePence: null }),
  ];

  it("never returns an unpriced variant", () => {
    expect(cheapestVariant(rows)?.showPricePence).toBe(3167);
    expect(dearestVariant(rows)?.showPricePence).toBe(6690);
    expect(cheapestVariant([row({ showPricePence: null })])).toBeNull();
    expect(cheapestVariant([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Against the REAL captured envelopes (2026-09-11, live test service).
// ---------------------------------------------------------------------------

const fixture = (name: string) => join(__dirname, "__fixtures__", name);
const replyOf = (file: string) =>
  parseXml(extractSoapResult("GetPrice", readFileSync(file, "utf8")) as string);

const ladderPath = fixture("ecp-getprice-ladder.xml");
const notFoundPath = fixture("ecp-getprice-notfound.xml");
const manufPath = fixture("ecp-getprice-manuf.xml");

describe.skipIf(!existsSync(ladderPath))("real ladder reply for ADS part 10459026", () => {
  const { rows, notFound } = splitParts(
    (replyOf(ladderPath) as never as { REPLY: never }).REPLY,
  );

  it("expands one catalogue number into a branded ladder", () => {
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(notFound).toEqual([]);
    expect(new Set(rows.map((r) => r.basePartNo))).toEqual(new Set(["10459026"]));
  });

  it("reads the nested Price / QualityDetails the docs show as flat", () => {
    const textar = rows.find((r) => r.brand === "TEXTAR");
    expect(textar).toBeDefined();
    expect(textar?.showPricePence).toBe(3167);
    expect(textar?.quality).toBe("OES");
    expect(textar?.description).toBeTruthy();
  });

  it("produces a genuine budget-to-OE ladder", () => {
    const cheapest = cheapestVariant(rows);
    const dearest = dearestVariant(rows);
    expect(cheapest?.showPricePence).toBe(3167);
    expect((dearest?.showPricePence as number) > (cheapest?.showPricePence as number)).toBe(true);
  });

  it("never yields a £0.00 row", () => {
    for (const r of rows) {
      expect(isNotFound(r)).toBe(false);
      if (r.showPricePence != null) expect(r.showPricePence).toBeGreaterThan(0);
    }
  });
});

describe.skipIf(!existsSync(notFoundPath))("real reply for an unknown part number", () => {
  it("reports Status 0 yet yields NO priced row — only a not-found entry", () => {
    const reply = (replyOf(notFoundPath) as never as { REPLY: never }).REPLY;
    const { rows, notFound } = splitParts(reply);
    expect(rows).toEqual([]);
    expect(notFound).toEqual(["000000000"]);
  });
});

describe.skipIf(!existsSync(manufPath))("real reply for a manufacturer-code lookup", () => {
  it("resolves to an ECP part and carries the surcharge separately", () => {
    const { rows } = splitParts((replyOf(manufPath) as never as { REPLY: never }).REPLY);
    expect(rows.length).toBeGreaterThan(0);
    const surcharged = rows.find((r) => r.surchargePence != null);
    expect(surcharged?.surchargePence).toBe(5995);
    // ShowPrice and the surcharge are carried as two figures and never summed —
    // whether ShowPrice already includes it is unverified. docs §8 Q1.
    expect(surcharged?.showPricePence).toBe(21620);
  });
});
