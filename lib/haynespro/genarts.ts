// TecDoc GenArt ids on a HaynesPro repair-time node (Task 40).
//
// HaynesPro returns `genarts: [{id, description}]` on repair-time nodes — the
// TecDoc "general article" product groups a repair consumes (82 brake discs,
// 402 brake pads …). Until Task 40 the catalogue composition threw them away.
// They are the key AAG's parts API prices by, so they are now carried through
// as an additive field; this is the single place that reads them.

import { chargedGroups } from "@/lib/parts/job-charges";
import type { HpRepairtimeNode } from "./types";

type GenartNode = Pick<HpRepairtimeNode, "genarts"> & { description?: string | null };

/**
 * Distinct positive GenArt ids a job charges for, in HaynesPro's order;
 * undefined when there are none. Since Task 73 a job that only checks, cleans
 * or removes/refits a part charges just its consumables (lib/parts/job-charges.ts),
 * so "Check the battery" has none and shows as labour only.
 */
export function genartIdsOf(node: GenartNode): number[] | undefined {
  const ids: number[] = [];
  for (const g of chargedGroups(node.description, node.genarts)) {
    if (typeof g?.id === "number" && g.id > 0 && !ids.includes(g.id)) ids.push(g.id);
  }
  return ids.length ? ids : undefined;
}

/** `{ genartIds }` to spread onto a catalogue node, or nothing. */
export function genartExtra(node: GenartNode): { genartIds?: number[] } {
  const genartIds = genartIdsOf(node);
  return genartIds ? { genartIds } : {};
}
