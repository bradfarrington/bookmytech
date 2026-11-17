import { describe, expect, it } from "vitest";

import type { HpFullTreeNode } from "@/lib/haynespro/tree";
import type { HpRepairtimeNode } from "@/lib/haynespro/types";
import type { AagPartOffers } from "./aag-part-prices";
import { proposeCodeMatches } from "./code-match-discovery";
import { scannedRepairs, scanView, treeRepairIds, type ScannedRepair } from "./model-scan";
import type { ModelPartChoiceRow } from "./model-parts";
import { candidatesFrom } from "./part-candidates";
import type { SupplierOffer } from "./supplier-offer";

const TREE: HpFullTreeNode[] = [
  {
    id: "1M1",
    desc: "Brake system",
    nodes: [
      {
        id: "1M70000000G",
        desc: "Brake fluid",
        nodes: [
          { id: "FLUID", desc: "Renew the brake fluid", nodes: null },
          { id: "CHECK", desc: "Check the brake fluid level", nodes: null },
        ],
      },
      { id: "1M10000000G", desc: "Discs", nodes: [{ id: "DISCS", desc: "Renew the front brake discs", nodes: null }] },
    ],
  },
  { id: "9X1", desc: "Body", nodes: [{ id: "FLUID", desc: "Renew the brake fluid", nodes: null }] },
];

const node = (id: string, description: string, genarts: Array<[number, string]>): HpRepairtimeNode =>
  ({ id, description, genarts: genarts.map(([gid, d]) => ({ id: gid, description: d, mandatory: true })) }) as unknown as HpRepairtimeNode;

const NODES = new Map<string, HpRepairtimeNode>([
  ["FLUID", node("FLUID", "Renew the brake fluid", [[71, "Brake fluid"]])],
  ["CHECK", node("CHECK", "Check the brake fluid level", [])],
  ["DISCS", node("DISCS", "Renew the front brake discs", [[82, "Brake disc"]])],
]);

const offer = (partNumber: string, over: Partial<SupplierOffer> = {}): SupplierOffer => ({
  supplier: "aag",
  partNumber,
  description: null,
  brand: "NAPA",
  tier: "Best",
  costPence: 1000,
  surchargePence: null,
  availability: [],
  totalQty: null,
  fitment: [],
  quantityOfFit: 1,
  position: null,
  imageUrl: null,
  notes: [],
  buyable: true,
  ...over,
});

describe("scannedRepairs", () => {
  const repairs = scannedRepairs(TREE, NODES);

  it("keeps the repairs that charge for parts, with their place in the tree", () => {
    expect(repairs.map((r) => r.id)).toEqual(["FLUID", "DISCS"]);
    expect(repairs[0].path.map((p) => p.name)).toEqual(["Brake system", "Brake fluid"]);
    expect(repairs[0].groups).toEqual([{ genartId: 71, label: "Brake fluid" }]);
  });

  it("lists a repair under two groups once, at its first place", () => {
    expect(repairs.filter((r) => r.id === "FLUID")).toHaveLength(1);
    expect(treeRepairIds(TREE)).toEqual(["FLUID", "CHECK", "DISCS"]);
  });
});

describe("scanView", () => {
  const repairs = scannedRepairs(TREE, NODES);
  const pick: ModelPartChoiceRow = {
    id: "p1",
    make_name: "FORD",
    model_label: "FORD Ranger",
    genart_id: 82,
    position: "front",
    product_id: "NPANBD5431",
    label: "Brake disc",
    brand: "NAPA",
    description: null,
    chosen_at: "2026-11-17T00:00:00Z",
  };

  it("marks NAPA-priced repairs priced and the rest missing, with the axle the repair names", () => {
    const answers = new Map<number, AagPartOffers>([
      [71, { state: "ok", offers: [offer("FLUID-1")], pricedAt: "x", lastKnown: false }],
      [82, { state: "empty", pricedAt: "x" }],
    ]);
    const view = scanView({ repairs, hidden: new Set(), answers, picks: [] });
    expect(view.map((v) => [v.id, v.status])).toEqual([
      ["FLUID", "priced"],
      ["DISCS", "gap"],
    ]);
    expect(view[1].missing[0]).toMatchObject({ genartId: 82, position: "front", unchecked: false, pick: null });
  });

  it("shows the model's pick on a missing part, and flags part types NAPA hasn't been asked about", () => {
    const view = scanView({ repairs, hidden: new Set(), answers: new Map(), picks: [pick] });
    expect(view[0].missing[0].unchecked).toBe(true);
    expect(view[1].missing[0].pick?.id).toBe("p1");
  });

  it("leaves out hidden repairs, and everything under a hidden group", () => {
    expect(scanView({ repairs, hidden: new Set(["DISCS"]), answers: new Map(), picks: [] }).map((v) => v.id)).toEqual(["FLUID"]);
    expect(scanView({ repairs, hidden: new Set(["1M1"]), answers: new Map(), picks: [] })).toEqual([]);
  });

  it("counts a set price as priced", () => {
    const view = scanView({
      repairs,
      hidden: new Set(),
      answers: new Map(),
      picks: [],
      setPrices: new Map([[71, { pence: 900, setAt: "x" }]]),
    });
    expect(view[0].status).toBe("priced");
  });
});

describe("candidatesFrom", () => {
  const cars = new Map([
    ["FN60KYP", { make: "FORD", model: "FORD Fiesta Mk VI" }],
    ["LA16DCV", { make: "BMW", model: "BMW 3 (F30, F31, F80)" }],
    ["S28BSW", { make: "FORD", model: "FORD Ranger" }],
  ]);

  it("lists each part once with the models it was priced on, same make first, never the model itself", () => {
    const out = candidatesFrom(
      [
        { reg: "LA16DCV", genart_id: 107, offers: [offer("H7-BMW"), offer("H7-SHARED")] },
        { reg: "FN60KYP", genart_id: 107, offers: [offer("H7-SHARED"), offer("LOCKED", { buyable: false })] },
        { reg: "S28BSW", genart_id: 107, offers: [offer("RANGER-OWN")] },
      ],
      cars,
      "FORD",
      "FORD Ranger",
    );
    const list = out.get(107)!;
    expect(list.map((c) => c.partNumber)).toEqual(["H7-SHARED", "H7-BMW"]);
    expect(list[0].seenOn).toEqual(["BMW 3 (F30, F31, F80)", "FORD Fiesta Mk VI"]);
  });
});

describe("proposeCodeMatches", () => {
  const scan = (reg: string, groups: Array<[number, string]>): { reg: string; modelLabel: string; repairs: Array<Pick<ScannedRepair, "groups">> } => ({
    reg,
    modelLabel: reg,
    repairs: [{ groups: groups.map(([genartId, label]) => ({ genartId, label })) }],
  });

  it("pairs brake fluid 71 with 3357: same name, NAPA has nothing for 71 and prices 3357", () => {
    const proposals = proposeCodeMatches({
      scans: [scan("S28BSW", [[71, "Brake fluid"]]), scan("FN60KYP", [[3357, "Brake fluid"]])],
      answers: [
        { reg: "S28BSW", genartId: 71, state: "empty", offers: [] },
        { reg: "FN60KYP", genartId: 3357, state: "ok", offers: [offer("FEB171874")] },
      ],
      existing: new Set(),
    });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ genartId: 71, napaGenartId: 3357, label: "Brake fluid", evidence: { reg: "FN60KYP", parts: 1 } });
  });

  it("never pairs similar names: a tie rod is not a tie rod end", () => {
    const proposals = proposeCodeMatches({
      scans: [scan("S28BSW", [[284, "Tie rod"]]), scan("FN60KYP", [[914, "Tie rod end"]])],
      answers: [
        { reg: "S28BSW", genartId: 284, state: "empty", offers: [] },
        { reg: "FN60KYP", genartId: 914, state: "ok", offers: [offer("TRE-1")] },
      ],
      existing: new Set(),
    });
    expect(proposals).toEqual([]);
  });

  it("skips a code NAPA prices somewhere, or one already mapped", () => {
    const scans = [scan("S28BSW", [[71, "Brake fluid"]]), scan("FN60KYP", [[3357, "Brake fluid"], [71, "Brake fluid"]])];
    const answers = [
      { reg: "S28BSW", genartId: 71, state: "empty" as const, offers: [] },
      { reg: "FN60KYP", genartId: 3357, state: "ok" as const, offers: [offer("A")] },
    ];
    expect(proposeCodeMatches({ scans, answers, existing: new Set([71]) })).toEqual([]);
    expect(
      proposeCodeMatches({ scans, answers: [...answers, { reg: "FN60KYP", genartId: 71, state: "ok", offers: [offer("B")] }], existing: new Set() }),
    ).toEqual([]);
  });
});
