// Shared filter logic for the admin jobs list and its CSV export.
//
// Both used to fetch a capped slice of `bookings` and filter it in JS, which
// meant two copies of the same predicate that could drift — and did, on which
// columns the search box looked at. Filtering now happens in Postgres, and both
// callers apply it through this module so the CSV always matches the screen.

export type JobTab = "all" | "live" | "pending" | "complete" | "disputed";

export const JOB_TABS: ReadonlyArray<{ value: JobTab; label: string }> = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "pending", label: "Pending" },
  { value: "complete", label: "Complete" },
  { value: "disputed", label: "Disputed" },
];

export const LIVE_STATUSES = ["confirmed", "en_route", "in_progress"] as const;

const STATUSES_FOR_TAB: Record<Exclude<JobTab, "all">, readonly string[]> = {
  live: LIVE_STATUSES,
  pending: ["sourcing_mechanic"],
  complete: ["completed"],
  disputed: ["disputed"],
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseJobTab(raw: string | null | undefined): JobTab {
  return raw === "live" || raw === "pending" || raw === "complete" || raw === "disputed"
    ? raw
    : "all";
}

/**
 * PostgREST's `or=` filter is comma-delimited and paren-grouped, so those
 * characters in a search term would break out of the value and change the
 * query. `%` and `*` are wildcards; strip them too so a search means what it
 * looks like.
 */
export function sanitiseJobSearch(raw: string | null | undefined): string {
  return (raw ?? "").trim().replace(/[,()*%\\]/g, "").slice(0, 80);
}

export interface JobFilters {
  tab: JobTab;
  /** Postcode district (bookings.area), or null for all. */
  area?: string | null;
  /** Already passed through sanitiseJobSearch. */
  search?: string | null;
}

/** The subset of the Supabase query builder these filters need. */
interface Filterable<T> {
  eq(column: string, value: unknown): T;
  in(column: string, values: readonly unknown[]): T;
  or(filters: string): T;
}

export function applyJobFilters<T extends Filterable<T>>(query: T, filters: JobFilters): T {
  let q = query;

  if (filters.tab !== "all") {
    q = q.in("status", STATUSES_FOR_TAB[filters.tab]);
  }

  if (filters.area) {
    q = q.eq("area", filters.area);
  }

  const search = filters.search?.trim();
  if (search) {
    const clauses = [
      `customer_name.ilike.%${search}%`,
      `customer_email.ilike.%${search}%`,
      `vehicle_reg.ilike.%${search}%`,
      `vehicle_make.ilike.%${search}%`,
      `vehicle_model.ilike.%${search}%`,
      `repair_description.ilike.%${search}%`,
    ];
    // Job refs are displayed zero-padded ("00042") but stored as a bigint, so
    // an ilike would never match — compare numerically once the padding is off.
    const digits = search.replace(/^0+/, "");
    if (/^\d+$/.test(digits) && digits.length <= 18) {
      clauses.push(`job_number.eq.${digits}`);
    }
    if (UUID_RE.test(search)) {
      clauses.push(`id.eq.${search}`);
    }
    q = q.or(clauses.join(","));
  }

  return q;
}
