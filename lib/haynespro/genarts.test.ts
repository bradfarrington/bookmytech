import { describe, expect, it } from "vitest";
import { EMPTY_OVERLAY, composeLevel } from "@/lib/catalogue/overlay";
import { toCatalogueNode } from "./catalogue";
import { genartExtra, genartIdsOf } from "./genarts";
import type { HpRepairtimeNode } from "./types";

const pads: HpRepairtimeNode = {
  id: "1M01510000WV0",
  description: "Renew the front brake pads",
  value: 80,
  genarts: [
    { id: 402, description: "Brake Pad Set, disc brake" },
    { id: 402, description: "duplicate" },
    { id: null, description: "no id" },
    { id: 0, description: "zero" },
  ],
};
const group: HpRepairtimeNode = { id: "1M2", description: "Brakes", hasSubnodes: true, genarts: [{ id: 82 }] };
const bare: HpRepairtimeNode = { id: "1M9", description: "Adjust the handbrake", value: 30 };

describe("genartIdsOf", () => {
  it("keeps distinct positive ids in HaynesPro's order", () => {
    expect(genartIdsOf(pads)).toEqual([402]);
    expect(genartIdsOf({ genarts: [{ id: 82 }, { id: 402 }] })).toEqual([82, 402]);
  });

  it("is undefined — not [] — when a node has none, so the field is simply absent", () => {
    expect(genartIdsOf(bare)).toBeUndefined();
    expect(genartIdsOf({ genarts: null })).toBeUndefined();
    expect(genartExtra(bare)).toEqual({});
  });
});

describe("genartIds on catalogue nodes (Task 40, additive)", () => {
  it("toCatalogueNode carries them on a repair and never on a group", () => {
    expect(toCatalogueNode(pads, 6000)?.genartIds).toEqual([402]);
    expect(toCatalogueNode(group, 6000)).not.toHaveProperty("genartIds");
    expect(toCatalogueNode(bare, 6000)).not.toHaveProperty("genartIds");
  });

  it("composeLevel carries them through the overlay path too", () => {
    const nodes = composeLevel({
      levelId: "1M2",
      raw: [pads, bare],
      overlay: EMPTY_OVERLAY,
      excluded: new Set(),
      hourlyRatePence: 6000,
      nodeHours: new Map(),
      combineHours: () => null,
    });
    expect(nodes.find((n) => n.id === pads.id)?.genartIds).toEqual([402]);
    expect(nodes.find((n) => n.id === bare.id)).not.toHaveProperty("genartIds");
  });
});
