// Pure date-range + bucketing helpers for the analytics dashboard. No I/O, so
// they're cheap to reason about (and unit-testable). The /admin/analytics
// server component uses these to turn a period choice into (current, previous)
// windows and to align the GMV trend series into fixed, gap-filled buckets.

export type PeriodValue = "7d" | "30d" | "90d" | "year";

export type Granularity = "day" | "week";

export interface PeriodRange {
  start: Date;
  end: Date;
  /** Immediately-preceding window of equal length, for comparison overlays. */
  prevStart: Date;
  prevEnd: Date;
  granularity: Granularity;
  days: number;
}

const PERIOD_DAYS: Record<PeriodValue, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  year: 365,
};

export function isPeriod(value: string | undefined): value is PeriodValue {
  return value === "7d" || value === "30d" || value === "90d" || value === "year";
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Resolve a period choice (relative to `now`) into current + prior windows. */
export function periodToRange(period: PeriodValue, now: Date = new Date()): PeriodRange {
  const days = PERIOD_DAYS[period];
  const end = now;
  const start = startOfDay(new Date(end.getTime() - days * 24 * 60 * 60 * 1000));
  const prevEnd = start;
  const prevStart = startOfDay(
    new Date(prevEnd.getTime() - days * 24 * 60 * 60 * 1000),
  );
  const granularity: Granularity = period === "year" ? "week" : "day";
  return { start, end, prevStart, prevEnd, granularity, days };
}

/**
 * Generate the ordered list of bucket-start dates spanning [start, end). Daily
 * buckets step by 1 day; weekly by 7. Used to gap-fill the GMV series so the
 * current and previous overlays always have matching lengths and align by index.
 */
export function buildBuckets(
  start: Date,
  end: Date,
  granularity: Granularity,
): Date[] {
  const stepDays = granularity === "week" ? 7 : 1;
  const stepMs = stepDays * 24 * 60 * 60 * 1000;
  const buckets: Date[] = [];
  let cursor = startOfDay(start).getTime();
  const endMs = end.getTime();
  // Cap iterations defensively (year of weeks ≈ 53, of days ≈ 366).
  let guard = 0;
  while (cursor < endMs && guard < 400) {
    buckets.push(new Date(cursor));
    cursor += stepMs;
    guard++;
  }
  return buckets;
}

export interface SeriesRow {
  bucket: string; // ISO timestamp from the RPC
  gmv_pence: number;
}

/**
 * Fold RPC series rows into a fixed bucket grid (gap-filled with zeros). Each
 * row is assigned to the last bucket whose start is ≤ the row's timestamp.
 */
export function bucketizeGmv(rows: SeriesRow[], buckets: Date[]): number[] {
  const totals = new Array(buckets.length).fill(0);
  if (buckets.length === 0) return totals;
  const starts = buckets.map((b) => b.getTime());
  for (const row of rows) {
    const t = new Date(row.bucket).getTime();
    let idx = 0;
    for (let i = 0; i < starts.length; i++) {
      if (starts[i] <= t) idx = i;
      else break;
    }
    totals[idx] += Number(row.gmv_pence) || 0;
  }
  return totals;
}
