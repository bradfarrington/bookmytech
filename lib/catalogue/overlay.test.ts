import { describe, expect, it } from "vitest";
import {
  buildOverlay,
  composeLevel,
  expandCatalogueItems,
  extraNodeIdsFor,
  bundleOptionId,
  customGroupId,
  EMPTY_OVERLAY,
} from "./overlay";
import type { HpRepairtimeNode } from "@/lib/haynespro/types";

const RATE = 6000;
const sum = (ids: string[], hours: Map<string, number>) =>
  ids.reduce((n, id) => n + (hours.get(id) ?? 0), 0);

const root: HpRepairtimeNode[] = [
  { id: "1M2", description: "Brakes (Mechanical)", hasSubnodes: true },
  { id: "1P1", description: "Body - Exterior", hasSubnodes: true },
];
const brakePads: HpRepairtimeNode[] = [
  { id: "1M01510000WV0", description: "Renew the front brake pads", value: 80 },
  { id: "1M01534000WV0", description: "Renew the rear brake pads", value: 80 },
];

const overlay = buildOverlay({
  groups: [{ id: "cat-1", name: "Brakes & tyres", parent_id: "root", display_order: 0 }],
  overrides: [
    { node_id: "1M2", kind: "group", description: "Brakes (Mechanical)", custom_name: "Brakes", parent_id: null, display_order: null },
    // Rear pads moved out of Brake pad into our category.
    { node_id: "1M01534000WV0", kind: "repair", description: "Renew the rear brake pads", custom_name: null, parent_id: customGroupId("cat-1"), display_order: 0 },
  ],
  bundles: [
    { id: "bun-1", name: "Brake pads & discs", description: null, parent_id: customGroupId("cat-1"), node_ids: ["1M01822000WV0", "1M01510000WV0", "1M01830000WV0", "1M01534000WV0"], display_order: 0, is_active: true },
    { id: "bun-off", name: "Old bundle", description: null, parent_id: "root", node_ids: ["1M01510000WV0"], display_order: 0, is_active: false },
  ],
  options: [
    { id: "opt-front", bundle_id: "bun-1", label: "Front", node_ids: ["1M01822000WV0", "1M01510000WV0"], position: 0 },
    { id: "opt-rear", bundle_id: "bun-1", label: "Rear", node_ids: ["1M01830000WV0", "1M01534000WV0"], position: 1 },
    { id: "opt-old", bundle_id: "bun-off", label: "Only", node_ids: ["1M01510000WV0"], position: 0 },
  ],
});

const hours = new Map<string, number>([
  ["1M01510000WV0", 0.8],
  ["1M01534000WV0", 0.8],
  ["1M01822000WV0", 1.1],
  ["1M01830000WV0", 1.1],
]);

// The part groups HaynesPro puts on these jobs: pads 402, discs 82.
const genarts = new Map<string, number[]>([
  ["1M01510000WV0", [402]],
  ["1M01534000WV0", [402]],
  ["1M01822000WV0", [82]],
  ["1M01830000WV0", [82]],
]);

const compose = (levelId: string, raw: HpRepairtimeNode[], excluded: string[] = []) =>
  composeLevel({
    levelId,
    raw,
    overlay,
    excluded: new Set(excluded),
    hourlyRatePence: RATE,
    nodeHours: hours,
    nodeGenarts: genarts,
    combineHours: (ids) => sum(ids, hours),
  });

describe("composeLevel", () => {
  it("renames HaynesPro groups and appends our categories at the root", () => {
    const nodes = compose("root", root);
    expect(nodes.map((n) => [n.id, n.description, n.kind])).toEqual([
      ["1M2", "Brakes", "group"],
      ["1P1", "Body - Exterior", "group"],
      [customGroupId("cat-1"), "Brakes & tyres", "group"],
    ]);
    expect(nodes[2].custom).toBe(true);
    // The switched-off bundle at the root is not listed.
    expect(nodes.some((n) => n.bundleId === "bun-off")).toBe(false);
  });

  it("drops a leaf that was moved away, and keeps the rest priced", () => {
    const nodes = compose("1M01500000G", brakePads);
    expect(nodes.map((n) => n.id)).toEqual(["1M01510000WV0"]);
    expect(nodes[0]).toMatchObject({ kind: "repair", billedHours: 1, pricePence: 6000 });
  });

  it("composes a category we created: moved-in leaf plus the combined repair's options", () => {
    const nodes = compose(customGroupId("cat-1"), []);
    expect(nodes.map((n) => [n.id, n.description])).toEqual([
      ["1M01534000WV0", "Renew the rear brake pads"],
      [bundleOptionId("opt-front"), "Brake pads & discs · Front"],
      [bundleOptionId("opt-rear"), "Brake pads & discs · Rear"],
    ]);
    const front = nodes[1];
    expect(front).toMatchObject({
      kind: "repair",
      bundleId: "bun-1",
      bundleName: "Brake pads & discs",
      optionLabel: "Front",
      billedHours: 1.9,
      pricePence: 11400,
    });
  });

  it("hides an option when one of its jobs is hidden or missing on this vehicle", () => {
    const hiddenPads = compose(customGroupId("cat-1"), [], ["1M01510000WV0"]);
    expect(hiddenPads.map((n) => n.id)).toEqual(["1M01534000WV0", bundleOptionId("opt-rear")]);

    const noRearDiscs = composeLevel({
      levelId: customGroupId("cat-1"),
      raw: [],
      overlay,
      excluded: new Set(),
      hourlyRatePence: RATE,
      nodeHours: new Map([...hours].filter(([id]) => id !== "1M01830000WV0")),
      combineHours: (ids) => sum(ids, hours),
    });
    expect(noRearDiscs.map((n) => n.id)).toEqual(["1M01534000WV0", bundleOptionId("opt-front")]);
  });

  it("names a single-option combined repair by the bundle alone", () => {
    const single = buildOverlay({
      bundles: [{ id: "b", name: "Full brake refresh", description: null, parent_id: "root", node_ids: ["1M01510000WV0"], display_order: 0, is_active: true }],
      options: [{ id: "o", bundle_id: "b", label: "Only", node_ids: ["1M01510000WV0"], position: 0 }],
    });
    const nodes = composeLevel({
      levelId: "root",
      raw: [],
      overlay: single,
      excluded: new Set(),
      hourlyRatePence: RATE,
      nodeHours: hours,
      combineHours: (ids) => sum(ids, hours),
    });
    expect(nodes[0].description).toBe("Full brake refresh");
    expect(nodes[0].optionLabel).toBeNull();
  });

  it("is HaynesPro's tree exactly with an empty overlay", () => {
    const nodes = composeLevel({
      levelId: "root",
      raw: root,
      overlay: EMPTY_OVERLAY,
      excluded: new Set(),
      hourlyRatePence: RATE,
      nodeHours: new Map(),
      combineHours: () => null,
    });
    expect(nodes.map((n) => n.description)).toEqual(["Brakes (Mechanical)", "Body - Exterior"]);
  });
});

describe("extraNodeIdsFor", () => {
  it("lists the moved-in leaves and active bundle jobs a level needs times for", () => {
    expect(extraNodeIdsFor(customGroupId("cat-1"), overlay)).toEqual([
      "1M01534000WV0",
      "1M01822000WV0",
      "1M01510000WV0",
      "1M01830000WV0",
    ]);
    expect(extraNodeIdsFor("root", overlay)).toEqual([]); // the root bundle is switched off
  });
});

describe("composeLevel part groups", () => {
  // A row that names no part group reads as a job needing nothing but labour,
  // so both clients print its price as the whole price. A job that DOES need
  // parts must carry its groups even when the level only knows it by id, or an
  // unpriceable row shows labour as though it were the total.
  it("carries a moved-in leaf's part groups", () => {
    const nodes = compose(customGroupId("cat-1"), []);
    const rear = nodes.find((n) => n.id === "1M01534000WV0");
    expect(rear?.genartIds).toEqual([402]);
  });

  it("gives a combined repair every part group its jobs use between them", () => {
    const nodes = compose(customGroupId("cat-1"), []);
    const front = nodes.find((n) => n.id === bundleOptionId("opt-front"));
    expect(front?.genartIds).toEqual([82, 402]);
  });

  it("leaves genartIds off a job that needs no parts", () => {
    const nodes = composeLevel({
      levelId: customGroupId("cat-1"),
      raw: [],
      overlay,
      excluded: new Set<string>(),
      hourlyRatePence: RATE,
      nodeHours: hours,
      combineHours: (ids) => sum(ids, hours),
    });
    expect(nodes.every((n) => n.genartIds === undefined)).toBe(true);
  });
});

describe("expandCatalogueItems", () => {
  it("passes plain jobs through and expands a combined repair", () => {
    const items = expandCatalogueItems(["1M01510000WV0", bundleOptionId("opt-front"), "1M01510000WV0"], overlay);
    expect(items).toEqual([
      { id: "1M01510000WV0", label: null, nodeIds: ["1M01510000WV0"] },
      { id: bundleOptionId("opt-front"), label: "Brake pads & discs · Front", nodeIds: ["1M01822000WV0", "1M01510000WV0"] },
    ]);
  });

  it("refuses categories, unknown options and switched-off bundles", () => {
    expect(expandCatalogueItems([customGroupId("cat-1")], overlay)).toBeNull();
    expect(expandCatalogueItems([bundleOptionId("nope")], overlay)).toBeNull();
    expect(expandCatalogueItems([bundleOptionId("opt-old")], overlay)).toBeNull();
  });
});
