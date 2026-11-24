import { describe, expect, it } from "vitest";

import { describePartPickRule, isPickValue, PART_PICK_KEYS, parsePartPickRule } from "./part-pick-rule";
import { DEFAULT_PART_PICK_RULE } from "./supplier-offer";

describe("parsePartPickRule", () => {
  it("reads the three settings", () => {
    const rows = new Map<string, unknown>([
      [PART_PICK_KEYS.price, "cheapest"],
      [PART_PICK_KEYS.rating, "any"],
      [PART_PICK_KEYS.stock, "in_stock"],
    ]);
    expect(parsePartPickRule(rows)).toEqual({ price: "cheapest", rating: "any", stock: "in_stock" });
  });

  it("keeps today's rule for anything missing or unknown", () => {
    expect(parsePartPickRule(new Map())).toEqual(DEFAULT_PART_PICK_RULE);
    const rows = new Map<string, unknown>([
      [PART_PICK_KEYS.price, "free"],
      [PART_PICK_KEYS.rating, 3],
      [PART_PICK_KEYS.stock, "in_stock"],
    ]);
    expect(parsePartPickRule(rows)).toEqual({ ...DEFAULT_PART_PICK_RULE, stock: "in_stock" });
  });

  it("checks values and describes the rule", () => {
    expect(isPickValue("rating", "better")).toBe(true);
    expect(isPickValue("rating", "premium")).toBe(false);
    expect(isPickValue("stock", "any")).toBe(true);
    expect(describePartPickRule({ price: "cheapest", rating: "any", stock: "in_stock" })).toBe("Cheapest · Any rating · In stock");
    expect(describePartPickRule(DEFAULT_PART_PICK_RULE)).toBe("Dearest · Best · In stock or not");
  });
});
