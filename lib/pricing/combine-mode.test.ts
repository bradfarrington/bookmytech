import { describe, expect, it } from "vitest";
import { DEFAULT_REPAIR_COMBINE_MODE, parseRepairCombineMode } from "./calculate";

describe("parseRepairCombineMode", () => {
  it("defaults to adding each job's book time", () => {
    expect(DEFAULT_REPAIR_COMBINE_MODE).toBe("sum");
    expect(parseRepairCombineMode(undefined)).toBe("sum");
    expect(parseRepairCombineMode(null)).toBe("sum");
    expect(parseRepairCombineMode("sum")).toBe("sum");
    expect(parseRepairCombineMode("anything else")).toBe("sum");
    expect(parseRepairCombineMode(1)).toBe("sum");
  });

  it("recognises the HaynesPro overlap-removal opt-in", () => {
    expect(parseRepairCombineMode("haynespro")).toBe("haynespro");
  });
});
