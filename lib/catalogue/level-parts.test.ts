import { describe, expect, it } from "vitest";

import type { JobPartsResult, QuotedPart } from "@/lib/parts/quote-parts";
import { foldLevelParts, type PartsRow } from "./level-parts";

const PRICED_AT = "2026-09-16T09:00:00.000Z";

function part(nodeId: string, linePence: number, genartId = 402): QuotedPart {
  return {
    nodeId,
    genartId,
    groupLabel: "Brake pad",
    supplier: "aag",
    partNumber: "P123",
    brand: "Bosch",
    description: null,
    imageUrl: null,
    position: null,
    rating: "Best",
    quantity: 1,
    unitPence: linePence,
    linePence,
    source: "default",
    lastKnown: false,
    pricedAt: PRICED_AT,
  };
}

function row(rowId: string, nodeIds: string[]): PartsRow {
  return {
    rowId,
    nodes: nodeIds.map((id) => ({ id, description: id, genarts: [{ id: 402, description: "Brake pad" }] })),
  };
}

describe("foldLevelParts", () => {
  it("gives each row the parts of its own jobs", () => {
    const rows = [row("n1", ["n1"]), row("n2", ["n2"])];
    const result: JobPartsResult = { ok: true, parts: [part("n1", 4820), part("n2", 1210)] };

    expect(foldLevelParts(rows, result)).toEqual(
      new Map([
        ["n1", 4820],
        ["n2", 1210],
      ]),
    );
  });

  it("adds up every job behind a combined repair", () => {
    const rows = [row("b:opt", ["n1", "n2"])];
    const result: JobPartsResult = {
      ok: true,
      parts: [part("n1", 4820), part("n1", 9900, 82), part("n2", 1210)],
    };

    expect(foldLevelParts(rows, result)).toEqual(new Map([["b:opt", 15930]]));
  });

  it("leaves a row out when one of its parts has no price", () => {
    const rows = [row("n1", ["n1"]), row("n2", ["n2"])];
    // n2's brake pads couldn't be priced: its labour alone is not what the
    // customer would pay, so the row must fall back to "+ parts".
    const result: JobPartsResult = {
      ok: false,
      parts: [part("n1", 4820)],
      missing: [{ nodeId: "n2", genartId: 402, label: "Brake pad", position: null }],
    };

    expect(foldLevelParts(rows, result)).toEqual(new Map([["n1", 4820]]));
  });

  it("drops a combined repair when any one of its jobs is unpriceable", () => {
    const rows = [row("b:opt", ["n1", "n2"])];
    const result: JobPartsResult = {
      ok: false,
      parts: [part("n1", 4820)],
      missing: [{ nodeId: "n2", genartId: 82, label: "Brake disc", position: "front" }],
    };

    expect(foldLevelParts(rows, result)).toEqual(new Map());
  });

  it("prices a row at zero when its part groups are all switched off", () => {
    // Charged groups are what `quoteJobParts` prices; a job left with none is
    // priced in full at nothing, which is a real answer, not a missing one.
    const rows = [row("n1", ["n1"])];

    expect(foldLevelParts(rows, { ok: true, parts: [] })).toEqual(new Map([["n1", 0]]));
  });
});
