import { describe, it, expect } from "vitest";
import {
  isPeriod,
  periodToRange,
  buildBuckets,
  bucketizeGmv,
  type SeriesRow,
} from "./periods";

describe("isPeriod", () => {
  it("accepts the four valid periods", () => {
    expect(isPeriod("7d")).toBe(true);
    expect(isPeriod("30d")).toBe(true);
    expect(isPeriod("90d")).toBe(true);
    expect(isPeriod("year")).toBe(true);
  });
  it("rejects anything else", () => {
    expect(isPeriod("1d")).toBe(false);
    expect(isPeriod(undefined)).toBe(false);
    expect(isPeriod("")).toBe(false);
  });
});

describe("periodToRange", () => {
  const now = new Date("2026-06-04T12:00:00Z");

  it("derives an equal-length prior window immediately before the current one", () => {
    const r = periodToRange("7d", now);
    expect(r.days).toBe(7);
    expect(r.granularity).toBe("day");
    // prior window ends exactly where the current one begins
    expect(r.prevEnd.getTime()).toBe(r.start.getTime());
    // both windows are the same length
    const curLen = r.end.getTime() - r.start.getTime();
    const prevLen = r.prevEnd.getTime() - r.prevStart.getTime();
    expect(prevLen).toBe(7 * 24 * 60 * 60 * 1000);
    // current length is ~7 days (start is floored to midnight so it's ≥ 7d)
    expect(curLen).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000);
  });

  it("uses weekly granularity for the year period", () => {
    expect(periodToRange("year", now).granularity).toBe("week");
    expect(periodToRange("90d", now).granularity).toBe("day");
  });
});

describe("buildBuckets", () => {
  it("produces one daily bucket per day in the range", () => {
    const start = new Date("2026-06-01T00:00:00");
    const end = new Date("2026-06-08T00:00:00");
    const buckets = buildBuckets(start, end, "day");
    expect(buckets).toHaveLength(7);
  });

  it("steps by seven days for weekly granularity", () => {
    const start = new Date("2026-06-01T00:00:00");
    const end = new Date("2026-06-29T00:00:00");
    const buckets = buildBuckets(start, end, "week");
    expect(buckets).toHaveLength(4);
  });
});

describe("bucketizeGmv", () => {
  const start = new Date("2026-06-01T00:00:00");
  const end = new Date("2026-06-04T00:00:00");
  const buckets = buildBuckets(start, end, "day"); // 3 daily buckets

  it("gap-fills missing buckets with zero", () => {
    const rows: SeriesRow[] = [
      { bucket: "2026-06-01T00:00:00", gmv_pence: 5000 },
      { bucket: "2026-06-03T00:00:00", gmv_pence: 2000 },
    ];
    expect(bucketizeGmv(rows, buckets)).toEqual([5000, 0, 2000]);
  });

  it("assigns a row to the last bucket whose start is <= the timestamp", () => {
    const rows: SeriesRow[] = [
      { bucket: "2026-06-02T15:30:00", gmv_pence: 1234 },
    ];
    expect(bucketizeGmv(rows, buckets)).toEqual([0, 1234, 0]);
  });

  it("returns an all-zero array when there are no rows", () => {
    expect(bucketizeGmv([], buckets)).toEqual([0, 0, 0]);
  });
});
