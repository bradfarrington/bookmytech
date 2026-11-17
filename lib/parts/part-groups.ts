// The TecDoc part groups ("GenArts") a HaynesPro repair uses (Task 45).
//
// Every HaynesPro repair node can carry `genarts: [{id, description}]`, the part
// groups that repair uses. Alliance Automotive prices by exactly those ids, so
// they are what a repair's parts are looked up by.
//
// Pure: no I/O. Unit-tested.

import type { HpRepairtimeNode } from "@/lib/haynespro/types";
import { chargedGroups } from "./job-charges";

export interface SeenPartGroup {
  genartId: number;
  description: string;
  /** A repair that uses it, for context. */
  sampleRepair: string | null;
}

/**
 * Distinct part groups the repair nodes charge for, first sighting wins. A job
 * that only checks, cleans or removes/refits a part charges just its
 * consumables (Task 73, job-charges.ts).
 */
export function partGroupsOnNodes(nodes: readonly HpRepairtimeNode[]): SeenPartGroup[] {
  const byId = new Map<number, SeenPartGroup>();
  for (const node of nodes) {
    for (const group of chargedGroups(node.description, node.genarts)) {
      if (typeof group?.id !== "number" || group.id <= 0 || byId.has(group.id)) continue;
      byId.set(group.id, {
        genartId: group.id,
        description: group.description?.trim() ?? "",
        sampleRepair: node.description?.trim() || null,
      });
    }
  }
  return [...byId.values()];
}
