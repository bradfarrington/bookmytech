import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AAG_LIVE_BASE_URL,
  AAG_UAT_BASE_URL,
  aagRegKey,
  buildAagHeaders,
  describeAagError,
  isAagAuthFailure,
  isAagSandbox,
  parseAagEnvelope,
  type AagConfig,
} from "./client";
import { cheapestLine, flattenQuote, isSellable, poundsToPence } from "./quote";
import type { AagQuoteBody, AagQuoteResponse } from "./types";

// The /api/quote example from the AAG manual (Data Contract Customer.pdf
// v1.07, section 1), trimmed to what the parser reads. Captured sandbox
// replies (scripts/probe-aag-quote.mjs --save) are used further down when
// they exist; until AAG's allowlist question is settled they may not.
const MANUAL_QUOTE: AagQuoteResponse = {
  Header: { SuccessFlag: true, Message: null, ErrorCode: null },
  Body: {
    Articles: [
      {
        ArticleProvider: "Apec",
        ArticleDescription: "B/DISC 258 * 4 (VENTED) - FRONT",
        CustomerProductGroup: ["82"],
        FittingPosition: "FR",
        AutocatProductGroup: "BDIS",
        ProductOptions: [
          {
            RequestLineId: "AAGQ1/1",
            DisplayOrder: 1,
            ProductId: "NPAPBD8077",
            Brand: "NAPA",
            BrandRating: "Standard",
            CustomerLockoutRating: "OK FOR SUPPLY",
            RecMinOrdQty: 2,
            CostPrice: 11.21,
            Surcharge: 0.0,
            Availability: [
              { AagLocationId: 451, AagBusinessUnit: "LV Subs", BranchCode: "Newcastle", LocationName: "CTS Newcastle", LocationType: "Buddy", QtyInStock: 1, EstDeliveryTime: "13:00", Priority: 1 },
              { AagLocationId: 452, AagBusinessUnit: "FPS", BranchCode: "Newcastle", LocationName: "FPS Newcastle", LocationType: "RDC", QtyInStock: 14, EstDeliveryTime: "17:00", Priority: 2 },
            ],
          },
          {
            RequestLineId: "AAGQ1/2",
            DisplayOrder: 2,
            ProductId: "APEDSK2647",
            Brand: "APEC",
            BrandRating: "Premium",
            CustomerLockoutRating: "OK FOR SUPPLY",
            RecMinOrdQty: 2,
            CostPrice: 15.28,
            Surcharge: 0.0,
            Availability: [
              { AagLocationId: 212, AagBusinessUnit: "LV Subs", BranchCode: "SCKN", LocationName: "CTS Middlesborough", LocationType: "Local", QtyInStock: 2, EstDeliveryTime: "10:36", Priority: 1 },
            ],
          },
        ],
      },
    ],
    VehicleDetails: [
      { Vrm: "YR64VJP", Vin: "WF0CXXGAKCEB79524", Make: "Ford", Model: "Fiesta Zetec S (MK7 FL (8299))", YearOfManufacture: "2014", Fuel: "PETROL", EngineSize: "998" },
    ],
  },
};

const CONFIG: AagConfig = {
  apiKey: "key-123",
  customerId: "QKF9999",
  verificationId: null,
  baseUrl: AAG_UAT_BASE_URL,
  authHeader: "x-api-key",
  authScheme: "",
};

describe("parseAagEnvelope", () => {
  it("takes SuccessFlag as the truth and hands back the Body", () => {
    const parsed = parseAagEnvelope<AagQuoteBody>(MANUAL_QUOTE);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.body.Articles?.[0]?.ArticleDescription).toContain("B/DISC");
  });

  it("reads a refusal from the Header even though AAG sends it with HTTP 200", () => {
    const parsed = parseAagEnvelope({
      Header: { SuccessFlag: false, Message: "User is unauthorized, check api key and customer key", ErrorCode: "ISE0034" },
      Body: null,
    });
    expect(parsed).toEqual({
      ok: false,
      errorCode: "ISE0034",
      message: "User is unauthorized, check api key and customer key",
    });
  });

  it("falls back to our own wording when the refusal carries no message", () => {
    const parsed = parseAagEnvelope({ Header: { SuccessFlag: false, ErrorCode: "ISE0101" } });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.message).toBe(describeAagError("ISE0101"));
  });

  it("treats a reply with no Header as success (the classic quote documents its header as 'not yet available')", () => {
    const withBody = parseAagEnvelope<{ QuoteId: string }>({ Body: { QuoteId: "AAGQ6880959" } });
    expect(withBody.ok && withBody.body.QuoteId).toBe("AAGQ6880959");
    const bare = parseAagEnvelope<{ QuoteId: string }>({ QuoteId: "AAGQ6880959", Products: [] });
    expect(bare.ok && bare.body.QuoteId).toBe("AAGQ6880959");
  });

  it("refuses an empty reply", () => {
    expect(parseAagEnvelope(null).ok).toBe(false);
    expect(parseAagEnvelope("").ok).toBe(false);
  });
});

describe("isAagAuthFailure", () => {
  it("is the two account-level codes and nothing else", () => {
    expect(isAagAuthFailure("ISE0034")).toBe(true);
    expect(isAagAuthFailure("ISE0101")).toBe(true);
    expect(isAagAuthFailure("ISE0005")).toBe(false);
    expect(isAagAuthFailure(null)).toBe(false);
  });
});

describe("buildAagHeaders", () => {
  it("sends the key under the configured header, bare by default", () => {
    const h = buildAagHeaders(CONFIG);
    expect(h["x-api-key"]).toBe("key-123");
    expect(h.customer_id).toBe("QKF9999");
    expect(h).not.toHaveProperty("verification_id");
  });

  it("prefixes a scheme when one is configured and adds verification_id only when issued", () => {
    const h = buildAagHeaders({ ...CONFIG, authHeader: "Authorization", authScheme: "ApiKey", verificationId: "v-1" });
    expect(h.Authorization).toBe("ApiKey key-123");
    expect(h.verification_id).toBe("v-1");
    expect(h).not.toHaveProperty("x-api-key");
  });
});

describe("aagRegKey / isAagSandbox", () => {
  it("uppercases and strips spaces and punctuation", () => {
    expect(aagRegKey("fn60 kyp")).toBe("FN60KYP");
    expect(aagRegKey(" lb21-xyz ")).toBe("LB21XYZ");
  });

  it("is the sandbox unless the live host is set explicitly", () => {
    expect(isAagSandbox(CONFIG)).toBe(true);
    expect(isAagSandbox({ baseUrl: AAG_LIVE_BASE_URL })).toBe(false);
    expect(isAagSandbox(null)).toBe(true);
  });
});

describe("poundsToPence / isSellable", () => {
  it("rounds AAG's decimal pounds to integer pence", () => {
    expect(poundsToPence(11.21)).toBe(1121);
    expect(poundsToPence(4.97)).toBe(497);
    expect(poundsToPence(100.76)).toBe(10076);
    expect(poundsToPence(0)).toBe(0);
    expect(poundsToPence(null)).toBeNull();
    expect(poundsToPence(Number.NaN)).toBeNull();
  });

  it("only an explicit lock-out is unsellable; unknown passes through", () => {
    expect(isSellable("OK FOR SUPPLY")).toBe(true);
    expect(isSellable("Unknown")).toBe(true);
    expect(isSellable(null)).toBe(true);
    expect(isSellable("LOCKED OUT")).toBe(false);
    expect(isSellable("Not for supply")).toBe(false);
  });
});

describe("flattenQuote on the manual's example", () => {
  const lines = flattenQuote(MANUAL_QUOTE.Body);

  it("yields one row per product option, in display order, with pence prices", () => {
    expect(lines.map((l) => l.productId)).toEqual(["NPAPBD8077", "APEDSK2647"]);
    expect(lines[0]).toMatchObject({
      article: "B/DISC 258 * 4 (VENTED) - FRONT",
      fittingPosition: "FR",
      requestLineId: "AAGQ1/1",
      brand: "NAPA",
      rating: "Standard",
      costPence: 1121,
      surchargePence: 0,
      minOrderQty: 2,
      sellable: true,
      totalQty: 15,
    });
  });

  it("picks the quickest location by AAG's Priority, not by list order or quantity", () => {
    expect(lines[0].quickest?.locationName).toBe("CTS Newcastle");
    expect(lines[0].quickest?.qty).toBe(1);
    expect(lines[0].stock[1].locationType).toBe("RDC");
  });

  it("cheapestLine is the NAPA disc", () => {
    expect(cheapestLine(lines)?.productId).toBe("NPAPBD8077");
  });

  it("drops a product with no id and survives an empty reply", () => {
    const noId = flattenQuote({ Articles: [{ ProductOptions: [{ CostPrice: 1 }] }] });
    expect(noId).toEqual([]);
    expect(flattenQuote(null)).toEqual([]);
    expect(cheapestLine([])).toBeNull();
  });
});

// Real sandbox replies, once captured. Skipped until the fixture exists so
// `npm test` is green before AAG has answered the allowlist question.
const fixturePath = join(__dirname, "__fixtures__", "quote-82.json");
describe.skipIf(!existsSync(fixturePath))("flattenQuote on a captured sandbox reply (GenArt 82)", () => {
  it("parses as a successful envelope with at least one priced, identified product", () => {
    const raw = JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;
    const parsed = parseAagEnvelope<AagQuoteBody>(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const lines = flattenQuote(parsed.body);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line.productId).toMatch(/\S/);
      expect(line.costPence == null || Number.isInteger(line.costPence)).toBe(true);
    }
  });
});
