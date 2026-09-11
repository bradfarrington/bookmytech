// The LKQ ADS component list (Task 42).
//
// 2,277 components, fetched once from LKQ's own
//   GET /APIv1.0/api/v2/Components/{appId}/GB/en
// and CHECKED IN as a fixture. It is imported at build time and never fetched at
// runtime, because what consumes an ADS credit is not documented (open question
// §8.4) and a 2,277-row metadata call might well bill for one.
//
// NB component numbers are NOT all numeric. 967 of the 2,277 look like "con001",
// "too409" or "EGS…". Anything that validates a component with /^\d+$/ will
// reject 42% of the catalogue — scripts/probe-ads-parts.mjs did exactly that and
// was wrong. Treat a component number as an opaque string.

import raw from "./__fixtures__/ads-components-GB-en.json";
import type { AdsComponent } from "./types";

export const LKQ_COMPONENTS: readonly AdsComponent[] = raw as AdsComponent[];

const byNumber = new Map<string, AdsComponent>(
  LKQ_COMPONENTS.map((c) => [c.ComponentNumber, c]),
);

export function componentByNumber(componentNumber: string): AdsComponent | null {
  return byNumber.get(String(componentNumber ?? "").trim()) ?? null;
}

/**
 * Search by name or number. Ranked exact → prefix → contains so that typing
 * "brake disc" puts "Brake Disc" above "Brake Disc Fitting Accessory".
 */
export function searchComponents(query: string, limit = 50): AdsComponent[] {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return [];

  const exact: AdsComponent[] = [];
  const prefix: AdsComponent[] = [];
  const contains: AdsComponent[] = [];

  for (const component of LKQ_COMPONENTS) {
    const name = component.ComponentName.toLowerCase();
    const number = component.ComponentNumber.toLowerCase();

    if (name === q || number === q) exact.push(component);
    else if (name.startsWith(q) || number.startsWith(q)) prefix.push(component);
    else if (name.includes(q) || number.includes(q)) contains.push(component);

    if (exact.length >= limit) break;
  }

  return [...exact, ...prefix, ...contains].slice(0, limit);
}

/** "000027 — Brake Disc", the shape the Combobox primitive takes (plain strings). */
export function componentOptionLabel(component: AdsComponent): string {
  return `${component.ComponentNumber} — ${component.ComponentName}`;
}

/** Recover the component number from a label the Combobox handed back. */
export function componentNumberFromLabel(label: string): string {
  const text = String(label ?? "").trim();
  const [head] = text.split("—");
  return (head ?? text).trim();
}
