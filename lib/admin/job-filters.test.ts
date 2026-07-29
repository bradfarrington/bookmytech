import { describe, it, expect } from "vitest";
import {
  applyJobFilters,
  parseJobTab,
  sanitiseJobSearch,
  LIVE_STATUSES,
} from "./job-filters";

// A stand-in for the Supabase query builder that records what was applied.
class FakeQuery {
  eqCalls: Array<[string, unknown]> = [];
  inCalls: Array<[string, readonly unknown[]]> = [];
  orCalls: string[] = [];

  eq(column: string, value: unknown) {
    this.eqCalls.push([column, value]);
    return this;
  }
  in(column: string, values: readonly unknown[]) {
    this.inCalls.push([column, values]);
    return this;
  }
  or(filters: string) {
    this.orCalls.push(filters);
    return this;
  }
}

describe("parseJobTab", () => {
  it("accepts the known tabs", () => {
    expect(parseJobTab("live")).toBe("live");
    expect(parseJobTab("disputed")).toBe("disputed");
  });

  it("falls back to 'all' for anything else", () => {
    expect(parseJobTab(undefined)).toBe("all");
    expect(parseJobTab(null)).toBe("all");
    expect(parseJobTab("nonsense")).toBe("all");
  });
});

describe("sanitiseJobSearch", () => {
  it("strips characters that would break out of a PostgREST or= filter", () => {
    expect(sanitiseJobSearch("smith,status.eq.completed")).toBe("smithstatus.eq.completed");
    expect(sanitiseJobSearch("a(b)c")).toBe("abc");
    expect(sanitiseJobSearch("100%")).toBe("100");
    expect(sanitiseJobSearch("back\\slash")).toBe("backslash");
  });

  it("keeps dots so emails stay searchable", () => {
    expect(sanitiseJobSearch(" alex@example.co.uk ")).toBe("alex@example.co.uk");
  });

  it("caps the length", () => {
    expect(sanitiseJobSearch("x".repeat(200))).toHaveLength(80);
  });
});

describe("applyJobFilters", () => {
  it("applies no filters for the default view", () => {
    const q = applyJobFilters(new FakeQuery(), { tab: "all" });
    expect(q.eqCalls).toEqual([]);
    expect(q.inCalls).toEqual([]);
    expect(q.orCalls).toEqual([]);
  });

  it("maps the live tab to its three statuses", () => {
    const q = applyJobFilters(new FakeQuery(), { tab: "live" });
    expect(q.inCalls).toEqual([["status", LIVE_STATUSES]]);
  });

  it("maps the remaining tabs to a single status", () => {
    expect(applyJobFilters(new FakeQuery(), { tab: "pending" }).inCalls).toEqual([
      ["status", ["sourcing_mechanic"]],
    ]);
    expect(applyJobFilters(new FakeQuery(), { tab: "complete" }).inCalls).toEqual([
      ["status", ["completed"]],
    ]);
  });

  it("filters by area only when one is given", () => {
    expect(applyJobFilters(new FakeQuery(), { tab: "all", area: "SE15" }).eqCalls).toEqual([
      ["area", "SE15"],
    ]);
    expect(applyJobFilters(new FakeQuery(), { tab: "all", area: null }).eqCalls).toEqual([]);
  });

  it("searches the text columns", () => {
    const q = applyJobFilters(new FakeQuery(), { tab: "all", search: "focus" });
    expect(q.orCalls).toHaveLength(1);
    expect(q.orCalls[0]).toContain("customer_name.ilike.%focus%");
    expect(q.orCalls[0]).toContain("vehicle_reg.ilike.%focus%");
    expect(q.orCalls[0]).not.toContain("job_number");
  });

  it("matches a zero-padded job ref numerically", () => {
    // Refs display as "00042" but job_number is a bigint, so an ilike can never
    // match — the padding has to come off and the comparison be numeric.
    const q = applyJobFilters(new FakeQuery(), { tab: "all", search: "00042" });
    expect(q.orCalls[0]).toContain("job_number.eq.42");
  });

  it("matches a booking id when the term is a uuid", () => {
    const id = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
    const q = applyJobFilters(new FakeQuery(), { tab: "all", search: id });
    expect(q.orCalls[0]).toContain(`id.eq.${id}`);
  });

  it("ignores an absurdly long digit string rather than overflowing bigint", () => {
    const q = applyJobFilters(new FakeQuery(), { tab: "all", search: "9".repeat(25) });
    expect(q.orCalls[0]).not.toContain("job_number");
  });

  it("combines tab, area and search", () => {
    const q = applyJobFilters(new FakeQuery(), {
      tab: "disputed",
      area: "M1",
      search: "smith",
    });
    expect(q.inCalls).toEqual([["status", ["disputed"]]]);
    expect(q.eqCalls).toEqual([["area", "M1"]]);
    expect(q.orCalls).toHaveLength(1);
  });
});
