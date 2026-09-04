import { describe, expect, it } from "vitest";
import {
  MAX_REPAIRS_PER_BOOKING,
  dedupeRepairIds,
  normaliseRepairIds,
  parseRepairIds,
  repairIdsFromInput,
  repairsQuery,
} from "./repair-ids";

describe("repair id helpers", () => {
  it("dedupes, trims and drops blanks, keeping first-seen order", () => {
    expect(dedupeRepairIds([" b ", "a", "", null, undefined, "b", "a", "c"])).toEqual(["b", "a", "c"]);
  });

  it("normalise caps at the per-booking maximum", () => {
    const ten = Array.from({ length: 10 }, (_, i) => `id${i}`);
    expect(normaliseRepairIds(ten)).toHaveLength(MAX_REPAIRS_PER_BOOKING);
    expect(normaliseRepairIds(ten)[0]).toBe("id0");
    expect(dedupeRepairIds(ten)).toHaveLength(10);
  });

  it("parses the list param, and the legacy single param", () => {
    expect(parseRepairIds({ repairs: "a,b,c" })).toEqual(["a", "b", "c"]);
    expect(parseRepairIds({ repair: "a" })).toEqual(["a"]);
    expect(parseRepairIds({})).toEqual([]);
    expect(parseRepairIds({ repairs: "", repair: "" })).toEqual([]);
  });

  it("prefers the list when both are present", () => {
    expect(parseRepairIds({ repairs: "x,y", repair: "z" })).toEqual(["x", "y"]);
  });

  it("takes the first value of a repeated param", () => {
    expect(parseRepairIds({ repairs: ["a,b", "c"] })).toEqual(["a", "b"]);
    expect(parseRepairIds({ repair: ["a", "b"] })).toEqual(["a"]);
  });

  it("reads URLSearchParams too", () => {
    expect(parseRepairIds(new URLSearchParams("reg=AB12CDE&repairs=a%2Cb"))).toEqual(["a", "b"]);
    expect(parseRepairIds(new URLSearchParams("repair=a"))).toEqual(["a"]);
  });

  it("builds a query fragment that round-trips", () => {
    const query = repairsQuery(["a", "b", "b"]);
    expect(query).toBe("repairs=a%2Cb");
    expect(parseRepairIds(new URLSearchParams(query))).toEqual(["a", "b"]);
    expect(repairsQuery([])).toBe("");
    expect(repairsQuery([" ", ""])).toBe("");
  });

  it("reads a booking input: the list wins, then the single field", () => {
    expect(repairIdsFromInput({ repairNodeIds: ["a", "b"], repairNodeId: "z" })).toEqual(["a", "b"]);
    expect(repairIdsFromInput({ repairNodeIds: [], repairNodeId: "z" })).toEqual(["z"]);
    expect(repairIdsFromInput({ repairNodeId: "z" })).toEqual(["z"]);
    expect(repairIdsFromInput({})).toEqual([]);
    // Not capped here — the caller decides whether too many is an error.
    const nine = Array.from({ length: 9 }, (_, i) => `n${i}`);
    expect(repairIdsFromInput({ repairNodeIds: nine })).toHaveLength(9);
  });
});
