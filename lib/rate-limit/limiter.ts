import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Rate limiting for the public mobile endpoints, backed by Postgres
// (`api_rate_limits` + `consume_rate_limit`, migration 0043). See that migration
// for why Postgres and not Redis.
//
// The in-memory cache in lookupVehicleAction is per-serverless-instance and so
// protects nothing: every cold instance starts empty, and DVLA VES + DVSA MOT
// bill us on every miss. This is the real guard.

/** Every tunable limit. Values live in `platform_settings` under the same key. */
export const RATE_LIMIT_DEFAULTS = {
  mobile_lookup_ip_burst: 10,
  mobile_lookup_ip_daily: 200,
  mobile_lookup_user_burst: 6,
  mobile_lookup_user_daily: 50,
  mobile_lookup_global_daily: 5000,
  mobile_signup_ip_burst: 5,
  mobile_signup_ip_daily: 20,
  // Repair catalogue (/repairs/tree, /quote). Far looser than lookup: drilling
  // through the tree is several requests in a row, and almost all of them are
  // memo hits that cost HaynesPro nothing. The global daily is the ceiling for
  // the whole catalogue, search included.
  mobile_catalogue_ip_burst: 60,
  mobile_catalogue_ip_daily: 1500,
  mobile_catalogue_user_burst: 40,
  mobile_catalogue_user_daily: 600,
  mobile_catalogue_global_daily: 30000,
  // /repairs/search gets its own tighter bucket on top: HaynesPro has no
  // keyword search, so one query can cost up to SEARCH_MAX_EXPANSIONS upstream
  // calls (lib/haynespro/catalogue.ts) where a tree request costs one.
  mobile_search_ip_burst: 15,
  mobile_search_ip_daily: 300,
  mobile_search_user_burst: 10,
  mobile_search_user_daily: 150,
} as const;

export type RateLimitKey = keyof typeof RATE_LIMIT_DEFAULTS;

export const MINUTE_SECONDS = 60;
export const DAY_SECONDS = 24 * 60 * 60;

export interface RateLimitRule {
  /** Which limit to apply — also the `platform_settings` key holding its value. */
  key: RateLimitKey;
  /** Who is being limited: `ip:1.2.3.4`, `user:<uuid>`, `global`. */
  subject: string;
  windowSeconds: number;
}

export type RateLimitVerdict =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number; key: RateLimitKey | null };

// Limits are read from the database so they can be retuned without a redeploy.
// Cached briefly per instance so we don't add a settings round-trip to every
// request — an edit therefore takes up to a minute to take effect everywhere.
const SETTINGS_TTL_MS = 60_000;
let settingsCache: { values: Record<string, number>; expiresAt: number } | null = null;

async function loadLimits(): Promise<Record<RateLimitKey, number>> {
  if (settingsCache && settingsCache.expiresAt > Date.now()) {
    return { ...RATE_LIMIT_DEFAULTS, ...settingsCache.values };
  }

  const values: Record<string, number> = {};
  try {
    const { data } = await createAdminClient()
      .from("platform_settings")
      .select("key, value")
      .in("key", Object.keys(RATE_LIMIT_DEFAULTS));

    for (const row of data ?? []) {
      const n = typeof row.value === "number" ? row.value : Number(row.value);
      if (Number.isFinite(n) && n > 0) values[row.key] = Math.round(n);
    }
    settingsCache = { values, expiresAt: Date.now() + SETTINGS_TTL_MS };
  } catch {
    // Fall through to the code defaults — an unreadable settings table must not
    // mean "no limit". Not cached, so we retry on the next request.
  }

  return { ...RATE_LIMIT_DEFAULTS, ...values };
}

/**
 * Count this request against every supplied rule and return the first refusal.
 *
 * **Fails closed.** If the counter can't be reached — the migration hasn't been
 * applied, the database is unreachable — the request is refused rather than
 * waved through. These endpoints spend real money and create real accounts; a
 * broken guard must not become an open one. The refusal is logged with the
 * underlying error so a missing migration is obvious rather than mysterious.
 */
export async function enforceRateLimits(rules: RateLimitRule[]): Promise<RateLimitVerdict> {
  if (rules.length === 0) return { allowed: true };

  const limits = await loadLimits();
  const admin = createAdminClient();

  for (const rule of rules) {
    const limit = limits[rule.key];

    const { data, error } = await admin.rpc("consume_rate_limit", {
      p_bucket: rule.key,
      p_subject: rule.subject,
      p_window_seconds: rule.windowSeconds,
      p_limit: limit,
    });

    if (error) {
      console.error(
        `rate limit unavailable (${rule.key}) — refusing the request. ` +
          `Has migration 0043_api_rate_limits.sql been applied?`,
        error,
      );
      return { allowed: false, retryAfterSeconds: 60, key: null };
    }

    // `returns table (...)` comes back as a one-row array.
    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.allowed === false) {
      const resetAt = row.reset_at ? new Date(row.reset_at).getTime() : Date.now() + 60_000;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
      return { allowed: false, retryAfterSeconds, key: rule.key };
    }
  }

  return { allowed: true };
}
