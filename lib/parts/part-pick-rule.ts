// How the default NAPA part is picked (Task 85). Gareth, via Brad
// (2026-11-24): "the cheapest parts quoted that are in stock", with a setting
// in the admin area where he chooses the price option, the rating, and stock.
//
// Three rows of `platform_settings`, beside the parts markup (no migration):
//   parts_pick_price    "cheapest" | "dearest"
//   parts_pick_rating   "any" | "best" | "better" | "good"
//   parts_pick_stock    "in_stock" | "any"
// A missing or unknown value is today's rule for that part of it
// (DEFAULT_PART_PICK_RULE: Best, dearest, stock ignored). The rule itself is
// pure and lives beside the offer shape (supplier-offer.ts: defaultOffer).
//
// An admin's choice for an engine variant, or a model's picked part, still
// stands whatever the rule says. A booking keeps the parts it was priced with.

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_PART_PICK_RULE,
  type PartPickRule,
  type PickPrice,
  type PickRating,
  type PickStock,
} from "./supplier-offer";

export const PART_PICK_KEYS = {
  price: "parts_pick_price",
  rating: "parts_pick_rating",
  stock: "parts_pick_stock",
} as const satisfies Record<keyof PartPickRule, string>;

export const PICK_PRICE_OPTIONS: ReadonlyArray<{ value: PickPrice; label: string }> = [
  { value: "cheapest", label: "Cheapest" },
  { value: "dearest", label: "Dearest" },
];

export const PICK_RATING_OPTIONS: ReadonlyArray<{ value: PickRating; label: string }> = [
  { value: "any", label: "Any rating" },
  { value: "best", label: "Best" },
  { value: "better", label: "Better" },
  { value: "good", label: "Good" },
];

export const PICK_STOCK_OPTIONS: ReadonlyArray<{ value: PickStock; label: string }> = [
  { value: "in_stock", label: "In stock" },
  { value: "any", label: "In stock or not" },
];

const ALLOWED: { [K in keyof PartPickRule]: ReadonlyArray<PartPickRule[K]> } = {
  price: PICK_PRICE_OPTIONS.map((o) => o.value),
  rating: PICK_RATING_OPTIONS.map((o) => o.value),
  stock: PICK_STOCK_OPTIONS.map((o) => o.value),
};

/** Whether a value is one of a field's options. Pure. */
export function isPickValue<K extends keyof PartPickRule>(field: K, value: unknown): value is PartPickRule[K] {
  return (ALLOWED[field] as readonly unknown[]).includes(value);
}

/** The rule from the settings rows, today's rule for anything missing or unknown. Pure. */
export function parsePartPickRule(values: ReadonlyMap<string, unknown>): PartPickRule {
  const rule: PartPickRule = { ...DEFAULT_PART_PICK_RULE };
  const price = values.get(PART_PICK_KEYS.price);
  const rating = values.get(PART_PICK_KEYS.rating);
  const stock = values.get(PART_PICK_KEYS.stock);
  if (isPickValue("price", price)) rule.price = price;
  if (isPickValue("rating", rating)) rule.rating = rating;
  if (isPickValue("stock", stock)) rule.stock = stock;
  return rule;
}

/** The rule in force now. Today's rule when unreadable. Never throws. */
export async function loadPartPickRule(db: SupabaseClient): Promise<PartPickRule> {
  try {
    const { data } = await db
      .from("platform_settings")
      .select("key, value")
      .in("key", Object.values(PART_PICK_KEYS));
    return parsePartPickRule(new Map(((data ?? []) as Array<{ key: string; value: unknown }>).map((r) => [r.key, r.value])));
  } catch {
    return { ...DEFAULT_PART_PICK_RULE };
  }
}

/** "Cheapest · Best · In stock": the rule in a few words, for admin screens. Pure. */
export function describePartPickRule(rule: PartPickRule): string {
  const label = <T,>(options: ReadonlyArray<{ value: T; label: string }>, value: T) =>
    options.find((o) => o.value === value)?.label ?? String(value);
  return [
    label(PICK_PRICE_OPTIONS, rule.price),
    label(PICK_RATING_OPTIONS, rule.rating),
    label(PICK_STOCK_OPTIONS, rule.stock),
  ].join(" · ");
}
