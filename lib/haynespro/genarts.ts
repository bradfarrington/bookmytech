// TecDoc GenArt ids on a HaynesPro repair-time node (Task 40).
//
// HaynesPro returns `genarts: [{id, description}]` on repair-time nodes — the
// TecDoc "general article" product groups a repair consumes (82 brake discs,
// 402 brake pads …). Until Task 40 the catalogue composition threw them away.
// They are the key AAG's parts API prices by, so they are now carried through
// as an additive field; this is the single place that reads them.

import type { HpRepairtimeNode } from "./types";

/** Distinct positive GenArt ids on a node, in HaynesPro's order; undefined when there are none. */
export function genartIdsOf(node: Pick<HpRepairtimeNode, "genarts">): number[] | undefined {
  const ids: number[] = [];
  for (const g of node.genarts ?? []) {
    if (typeof g?.id === "number" && g.id > 0 && !ids.includes(g.id)) ids.push(g.id);
  }
  return ids.length ? ids : undefined;
}

/** `{ genartIds }` to spread onto a catalogue node, or nothing. */
export function genartExtra(node: Pick<HpRepairtimeNode, "genarts">): { genartIds?: number[] } {
  const genartIds = genartIdsOf(node);
  return genartIds ? { genartIds } : {};
}
