import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  componentByNumber,
  componentNumberFromLabel,
  componentOptionLabel,
  LKQ_COMPONENTS,
  searchComponents,
} from "./components";
import { adHocGroup, genartForComponent, groupByKey, PART_GROUPS } from "./mapping";
import type { AdsAttribute } from "./types";
import { normaliseReg } from "@/lib/utils";
import {
  adsRegKey,
  attributeValue,
  attributeValues,
  describeVehicle,
  vehicleSummary,
} from "./vehicle";

describe("the ADS component list", () => {
  it("is the full 2,277-row catalogue", () => {
    expect(LKQ_COMPONENTS.length).toBe(2277);
  });

  it("treats component numbers as opaque strings, not integers", () => {
    // 967 of the 2,277 are not numeric ("con001", "too409"). Validating a
    // component with /^\d+$/ would reject 42% of the catalogue.
    const nonNumeric = LKQ_COMPONENTS.filter((c) => !/^\d+$/.test(c.ComponentNumber));
    expect(nonNumeric.length).toBeGreaterThan(900);
    expect(componentByNumber(nonNumeric[0].ComponentNumber)).not.toBeNull();
  });

  it("proves the documentation's worked example wrong, permanently", () => {
    // The docx says "104 = Brake Discs". It is not.
    expect(componentByNumber("000104")?.ComponentName).toBe("Distributor Cap");
    expect(componentByNumber("000027")?.ComponentName).toBe("Brake Disc");
    expect(componentByNumber("104")).toBeNull();
  });

  it("ranks exact matches above prefix above contains", () => {
    const hits = searchComponents("brake disc").map((h) => h.ComponentName);
    // exact
    expect(hits[0]).toBe("Brake Disc");
    // prefix beats contains: "Brake Disc Screws" starts with the query,
    // "High Performance Brake Disc" only contains it.
    expect(hits.indexOf("Brake Disc Screws")).toBeLessThan(
      hits.indexOf("High Performance Brake Disc"),
    );
  });

  it("round-trips a Combobox label back to its number", () => {
    const disc = componentByNumber("000027")!;
    const label = componentOptionLabel(disc);
    expect(label).toBe("000027 — Brake Disc");
    expect(componentNumberFromLabel(label)).toBe("000027");
  });

  it("returns nothing for an empty query rather than the whole catalogue", () => {
    expect(searchComponents("")).toEqual([]);
    expect(searchComponents("   ")).toEqual([]);
  });
});

describe("the GenArt <-> component mapping", () => {
  it("names a component that really exists, with the exact current name", () => {
    // If LKQ renames a component, this fails the build rather than silently
    // pricing the wrong part.
    for (const group of PART_GROUPS) {
      const component = componentByNumber(group.component as string);
      expect(component, `${group.key} -> ${group.component}`).not.toBeNull();
      expect(component?.ComponentName, `${group.key} name drift`).toBe(group.componentName);
    }
  });

  it("has unique keys and plausible GenArt ids", () => {
    expect(new Set(PART_GROUPS.map((g) => g.key)).size).toBe(PART_GROUPS.length);
    for (const group of PART_GROUPS) {
      expect(Number(group.genart)).toBeGreaterThan(0);
    }
  });

  it("maps both ways for the verified pairs", () => {
    expect(groupByKey("brake-discs")?.component).toBe("000027");
    expect(groupByKey("brake-discs")?.genart).toBe("82");
    expect(genartForComponent("000027")).toBe("82");
    expect(genartForComponent("000104")).toBeNull();
  });

  it("marks the judgement calls as assumed, with a reason", () => {
    const assumed = PART_GROUPS.filter((g) => g.confidence === "assumed");
    expect(assumed.map((g) => g.key).sort()).toEqual(["clutch", "wishbone"]);
    for (const group of assumed) expect(group.note).toBeTruthy();
  });

  it("builds an ad-hoc group with no GenArt, so AAG renders 'not mapped'", () => {
    const group = adHocGroup("000399", "Brake Drum");
    expect(group.genart).toBeNull();
    expect(group.component).toBe("000399");
  });
});

describe("adsRegKey", () => {
  it("strips punctuation and does NOT insert a display space", () => {
    expect(adsRegKey("nv57 xgp")).toBe("NV57XGP");
    expect(adsRegKey("NV57-XGP")).toBe("NV57XGP");
    // The display formatter would give "NV57 XGP" — wrong as a VRM and wrong as
    // a cache key, because it varies with the caller's input.
    expect(normaliseReg("nv57xgp")).toBe("NV57 XGP");
    expect(adsRegKey("nv57xgp")).not.toBe(normaliseReg("nv57xgp"));
  });
});

// ---------------------------------------------------------------------------
// Against the REAL captured vehicle reply (2026-09-11).
// ---------------------------------------------------------------------------

const attrsPath = join(__dirname, "__fixtures__", "ads-attributes-NV57XGP.json");

describe.skipIf(!existsSync(attrsPath))("real vehicle attributes for NV57XGP", () => {
  const attrs = JSON.parse(readFileSync(attrsPath, "utf8")) as AdsAttribute[];

  it("is a multimap — the same name carries more than one value", () => {
    expect(attributeValues(attrs, "Fuel").sort()).toEqual(["PETROL", "Petrol"]);
    expect(attributeValues(attrs, "BodyStyle")).toContain("4 DOOR SALOON");
    expect(attributeValues(attrs, "BodyStyle")).toContain("Saloon");
  });

  it("LOSES data when collapsed into an object keyed by name", () => {
    // This is the trap encoded as a test: never do this to the attribute list.
    const collapsed = Object.fromEntries(attrs.map((a) => [a.Name, a.Value]));
    expect(Object.keys(collapsed).length).toBeLessThan(attrs.length);
  });

  it("summarises the vehicle from the fuller of each duplicate", () => {
    const summary = vehicleSummary(attrs);
    expect(summary.make).toBe("Volvo");
    expect(summary.model).toBe("S40");
    expect(summary.engineCode).toBe("B4164S3");
    expect(summary.engineCc).toBe("1596");
    expect(summary.bodyStyle).toBe("4 DOOR SALOON");
    expect(summary.vin).toBe("YV1MS204282384666");
    expect(summary.imageUrl).toMatch(/^https:\/\//);
  });

  it("describes it in one line", () => {
    expect(describeVehicle(vehicleSummary(attrs))).toContain("Volvo S40");
  });

  it("returns null for a name that isn't there", () => {
    expect(attributeValue(attrs, "NotARealAttribute")).toBeNull();
  });
});
