import { describe, expect, it } from "vitest";
import { contextKeyFor, readTimeParams, stepQuery } from "./step-params";

describe("readTimeParams", () => {
  it("accepts a window we write and normalises the instant", () => {
    expect(
      readTimeParams({ slot: "2026-09-20T07:00:00.000Z", window: "8am–10am" }),
    ).toEqual({ slot: "2026-09-20T07:00:00.000Z", window: "8am–10am", days: [] });
  });

  it("keeps two or more valid candidate days, sorted and deduplicated", () => {
    const time = readTimeParams({
      slot: "2026-09-20T07:00:00.000Z",
      window: "All day (8am–8pm)",
      days: "2026-09-22,2026-09-20,2026-09-22,not-a-day",
    });
    expect(time?.days).toEqual(["2026-09-20", "2026-09-22"]);
  });

  it("drops a single candidate day", () => {
    const time = readTimeParams({
      slot: "2026-09-20T07:00:00.000Z",
      window: "All day (8am–8pm)",
      days: "2026-09-20",
    });
    expect(time?.days).toEqual([]);
  });

  it("refuses an unknown window, a bad date or a missing slot", () => {
    expect(readTimeParams({ slot: "2026-09-20T07:00:00.000Z", window: "Morning" })).toBeNull();
    expect(readTimeParams({ slot: "yesterday", window: "8am–10am" })).toBeNull();
    expect(readTimeParams({ window: "8am–10am" })).toBeNull();
  });
});

describe("stepQuery", () => {
  const base = { reg: "AB12CDE", repairs: ["a", "b", "a"], make: "FORD", postcode: "SW1A 1AA", pref: "m1" };

  it("carries the job, vehicle and time", () => {
    const query = new URLSearchParams(
      stepQuery(base, { slot: "2026-09-20T07:00:00.000Z", window: "8am–10am", days: [] }),
    );
    expect(query.get("reg")).toBe("AB12CDE");
    expect(query.get("repairs")).toBe("a,b");
    expect(query.get("make")).toBe("FORD");
    expect(query.get("postcode")).toBe("SW1A 1AA");
    expect(query.get("pref")).toBe("m1");
    expect(query.get("window")).toBe("8am–10am");
    expect(query.has("days")).toBe(false);
  });

  it("carries only the quote (and postcode) for a follow-on visit", () => {
    const query = new URLSearchParams(
      stepQuery({ reg: "AB12CDE", repairs: [], quote: "q1", pref: "m1", postcode: "SE1 1AA" }),
    );
    expect([...query.keys()].sort()).toEqual(["postcode", "quote"]);
  });
});

describe("contextKeyFor", () => {
  it("is the same for the same job however the reg is spaced", () => {
    expect(contextKeyFor({ reg: "ab12 cde", repairs: ["a"] })).toBe(
      contextKeyFor({ reg: "AB12CDE", repairs: ["a"] }),
    );
  });

  it("differs between jobs and between a job and a quote", () => {
    expect(contextKeyFor({ reg: "AB12CDE", repairs: ["a"] })).not.toBe(
      contextKeyFor({ reg: "AB12CDE", repairs: ["b"] }),
    );
    expect(contextKeyFor({ reg: "AB12CDE", repairs: [], quote: "q1" })).toBe("quote:q1");
  });
});
