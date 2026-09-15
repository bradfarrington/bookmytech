// The TecDoc part groups ("GenArts") a HaynesPro repair uses (Task 45).
//
// Every HaynesPro repair node can carry `genarts: [{id, description}]`, the part
// groups that repair uses. Alliance Automotive prices by exactly those ids, so
// they are what a repair's parts are looked up by.
//
// Pure: no I/O. Unit-tested.

import type { HpRepairtimeNode } from "@/lib/haynespro/types";

export interface SeenPartGroup {
  genartId: number;
  description: string;
  /** A repair that uses it, for context. */
  sampleRepair: string | null;
}

/** Distinct part groups on a set of repair nodes, first sighting wins. */
export function partGroupsOnNodes(nodes: readonly HpRepairtimeNode[]): SeenPartGroup[] {
  const byId = new Map<number, SeenPartGroup>();
  for (const node of nodes) {
    for (const group of node.genarts ?? []) {
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
