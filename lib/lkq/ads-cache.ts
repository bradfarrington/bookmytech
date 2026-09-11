// Credit conservation for the metered ADS catalogue (Task 42).
//
// The test account was issued 500 credits and EVERY catalogue call spends one.
// A fresh registration plus a fresh product group costs 2. Without controls, an
// admin clicking through eight product groups on four cars burns 36 credits in a
// minute, and the account is dead inside a week.
//
// The governing split:
//   CACHE the catalogue — which parts fit a car does not change.
//   NEVER CACHE the price — cost and stock are live, and a stale price that
//   reaches a quote is worse than a spent credit.
//
// Cache rows live in platform_settings because Task 42 ships no migration. That
// is a deliberate compromise for an admin-only tool, not a pattern to copy: the
// table was built for a handful of knobs. If this ever goes customer-facing it
// needs a real table with an index and a TTL sweep. Recorded in the task doc.

import type { SupabaseClient } from "@supabase/supabase-js";

import { adsMonthlyCallCap } from "./config";

/** Vehicle attributes for a registration. They do not change. */
export const ADS_VEHICLE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Which parts fit a vehicle. Changes only when LKQ re-catalogues. */
export const ADS_PARTS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const ADS_USAGE_KEY = "lkq_ads_usage";

const CACHE_PREFIX = "lkq:ads:";

export function vehicleCacheKey(regKey: string): string {
  return `${CACHE_PREFIX}vehicle:${regKey}`;
}

export function partsCacheKey(regKey: string, component: string, increment: number): string {
  return `${CACHE_PREFIX}parts:${regKey}:${component}:${increment}`;
}

export function isCacheFresh(at: string, ttlMs: number, now: number = Date.now()): boolean {
  const stamp = Date.parse(at);
  if (!Number.isFinite(stamp)) return false;
  return now - stamp < ttlMs;
}

interface CacheEnvelope<T> {
  at: string;
  value: T;
}

export async function readAdsCache<T>(
  db: SupabaseClient,
  key: string,
  ttlMs: number,
): Promise<T | null> {
  try {
    const { data } = await db
      .from("platform_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();

    const raw = data?.value as CacheEnvelope<T> | null | undefined;
    if (!raw || typeof raw.at !== "string" || raw.value === undefined) return null;
    if (!isCacheFresh(raw.at, ttlMs)) return null;
    return raw.value;
  } catch {
    return null;
  }
}

export async function writeAdsCache<T>(
  db: SupabaseClient,
  key: string,
  value: T,
): Promise<void> {
  try {
    const envelope: CacheEnvelope<T> = { at: new Date().toISOString(), value };
    await db
      .from("platform_settings")
      .upsert({ key, value: envelope, updated_at: new Date().toISOString() });
  } catch {
    // A cache that can't be written just costs a credit next time.
  }
}

/** Current month as "YYYY-MM", the window the credit budget resets on. */
export function usageMonth(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export interface AdsUsage {
  month: string;
  used: number;
  cap: number;
}

export async function readAdsUsage(db: SupabaseClient): Promise<AdsUsage> {
  const cap = adsMonthlyCallCap();
  const month = usageMonth();
  try {
    const { data } = await db
      .from("platform_settings")
      .select("value")
      .eq("key", ADS_USAGE_KEY)
      .maybeSingle();

    const raw = data?.value as { month?: string; used?: number } | null | undefined;
    if (!raw || raw.month !== month || typeof raw.used !== "number") {
      return { month, used: 0, cap };
    }
    return { month, used: raw.used, cap };
  } catch {
    return { month, used: 0, cap };
  }
}

/**
 * Claim one credit. Returns allowed:false once the monthly cap is reached, at
 * which point the callers stop asking ADS anything and the page says so plainly.
 *
 * This is a best-effort counter, not a transaction — two instances racing could
 * each read the same figure. That is acceptable for a budget guard whose job is
 * to stop a runaway, not to be exact to the credit.
 */
export async function spendAdsCredit(
  db: SupabaseClient,
): Promise<{ allowed: boolean; used: number; cap: number }> {
  const usage = await readAdsUsage(db);
  if (usage.used >= usage.cap) {
    return { allowed: false, used: usage.used, cap: usage.cap };
  }

  const used = usage.used + 1;
  try {
    await db.from("platform_settings").upsert({
      key: ADS_USAGE_KEY,
      value: { month: usage.month, used },
      updated_at: new Date().toISOString(),
    });
  } catch {
    // If we can't record it we still allow the call; under-counting is safer
    // than blocking the tool on a settings write.
  }
  return { allowed: true, used, cap: usage.cap };
}
