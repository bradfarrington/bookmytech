import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEmailTemplateLocked } from "./locked";

// Admin per-template on/off switches for SMS and email (Task 22), backed by
// `notification_toggles` (0053). A key with no row is ON.
//
// `isNotificationEnabled` sits on the hot path of every notification, so the
// disabled set is read once and cached per instance for a minute — the same
// shape as `loadLimits` in lib/rate-limit/limiter.ts. An admin flip therefore
// takes up to a minute to reach every serverless instance (the instance that
// handled the flip clears its own cache at once).
//
// Fails OPEN: if the table can't be read (not yet migrated, database blip) the
// answer is "enabled", and the failure is not cached so the next call retries.
// A notification going out that the admin had switched off is the lesser evil
// next to every notification silently stopping.

export type NotificationChannel = "sms" | "email";

const CACHE_TTL_MS = 60_000;
let cache: { disabled: Set<string>; expiresAt: number } | null = null;

function cacheKey(channel: NotificationChannel, key: string): string {
  return `${channel}:${key}`;
}

async function loadDisabled(): Promise<Set<string>> {
  if (cache && cache.expiresAt > Date.now()) return cache.disabled;
  try {
    const { data, error } = await createAdminClient()
      .from("notification_toggles")
      .select("channel, key")
      .eq("enabled", false);
    if (error) throw error;
    const disabled = new Set(
      (data ?? []).map((r) => cacheKey(r.channel as NotificationChannel, r.key as string)),
    );
    cache = { disabled, expiresAt: Date.now() + CACHE_TTL_MS };
    return disabled;
  } catch {
    // Stale is better than nothing; nothing is "everything on".
    return cache?.disabled ?? new Set();
  }
}

/** Whether a template may send right now. Locked email templates are always on. */
export async function isNotificationEnabled(
  channel: NotificationChannel,
  key: string,
): Promise<boolean> {
  if (channel === "email" && isEmailTemplateLocked(key)) return true;
  const disabled = await loadDisabled();
  return !disabled.has(cacheKey(channel, key));
}

/** Drop this instance's cache — called by the admin actions after a flip. */
export function clearNotificationToggleCache(): void {
  cache = null;
}

/**
 * The keys currently switched OFF for a channel, read fresh (no cache) — for
 * the admin editors, which must show the truth rather than a minute-old copy.
 */
export async function fetchDisabledKeys(channel: NotificationChannel): Promise<Set<string>> {
  try {
    const { data } = await createAdminClient()
      .from("notification_toggles")
      .select("key")
      .eq("channel", channel)
      .eq("enabled", false);
    return new Set((data ?? []).map((r) => r.key as string));
  } catch {
    return new Set();
  }
}
