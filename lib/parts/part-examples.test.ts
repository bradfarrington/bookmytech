import { describe, expect, it } from "vitest";

import brakeDiscs from "@/lib/lkq/__fixtures__/ads-parts-000027-1.json";
import type { AdsPartsReply } from "@/lib/lkq/types";
import { adsPartExamples, EXAMPLE_LIMIT, examplesPanel, type PartExample } from "./part-examples";

const example = (key: string, imageUrl: string | null): PartExample => ({
  key,
  imageUrl,
  title: key,
  details: [],
});

describe("adsPartExamples on LKQ's brake discs for NV57XGP", () => {
  const examples = adsPartExamples(brakeDiscs as AdsPartsReply, "Brake Disc");

  it("gives one example per catalogue part, duplicates dropped", () => {
    const numbers = (brakeDiscs as AdsPartsReply).Parts!.map((p) => p.PartNumber);
    expect(examples).toHaveLength(new Set(numbers).size);
  });

  it("carries the picture and labelled fitment, without the supplier name", () => {
    const first = examples[0];
    expect(first.title).toBe("Brake Disc");
    expect(first.imageUrl).toMatch(/^https:\/\//);
    expect(first.details).toContain("Fitting Position: Front");
    expect(first.details.some((d) => d.startsWith("SupplierName"))).toBe(false);
  });

  it("tolerates an empty or missing reply", () => {
    expect(adsPartExamples(null, "Brake Disc")).toEqual([]);
    expect(adsPartExamples({ Parts: [{ PartNumber: " " }] }, "Brake Disc")).toEqual([]);
  });
});

describe("examplesPanel", () => {
  it("says so when there is nothing to show", () => {
    expect(examplesPanel([], "Nothing here.")).toEqual({ state: "empty", message: "Nothing here." });
  });

  it("puts pictures first and caps the list, keeping the true total", () => {
    const many = Array.from({ length: EXAMPLE_LIMIT + 3 }, (_, i) => example(`p${i}`, i === 5 ? "https://x/5.jpg" : null));
    const panel = examplesPanel(many, "");
    expect(panel.state).toBe("ok");
    if (panel.state !== "ok") return;
    expect(panel.examples).toHaveLength(EXAMPLE_LIMIT);
    expect(panel.examples[0].key).toBe("p5");
    expect(panel.total).toBe(EXAMPLE_LIMIT + 3);
  });
});
