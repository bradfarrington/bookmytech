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
  // Checkout (/checkout/prepare). Authenticated, but every call re-quotes
  // through HaynesPro AND opens a Stripe PaymentIntent. An unconfirmed intent
  // costs nothing and expires on its own, so this is about keeping a loop from
  // filling the Stripe dashboard and burning metered quote credit, not about a
  // direct bill. Loose enough that changing your mind at the payment step —
  // going back, editing the slot, coming forward again — never trips it.
  mobile_checkout_user_burst: 10,
  mobile_checkout_user_daily: 60,
  mobile_checkout_ip_burst: 20,
  mobile_checkout_ip_daily: 300,
  // Booking create (/bookings). A real customer books once, occasionally twice.
  // These are an abuse ceiling, not a quota: every call writes a row, dispatches
  // to mechanics and sends an email and an SMS, so a loop here is noisy in
  // people's actual jobs list, not just in a table.
  mobile_booking_user_burst: 5,
  mobile_booking_user_daily: 25,
  mobile_booking_ip_burst: 10,
  mobile_booking_ip_daily: 100,
  // Managing a booking after it exists: cancel, reschedule, answer a proposed
  // move, leave a review, open or withdraw a dispute, release a stranded hold.
  // Every one of these settles money, emails people or changes a job a mechanic
  // is holding time for, so a loop is felt by humans and not just by a table.
  // A real customer does a handful of these across a whole booking, so this is
  // deliberately tight — but not so tight that a mistyped cancellation reason
  // and a retry trips it.
  mobile_action_user_burst: 8,
  mobile_action_user_daily: 40,
  mobile_action_ip_burst: 20,
  mobile_action_ip_daily: 200,
  // Dispute thread messages. Chatty by nature — a real argument is a dozen
  // messages back and forth — so much looser than the actions above. It writes
  // a row and emails the mechanic, which is what stops this being unlimited.
  mobile_message_user_burst: 20,
  mobile_message_user_daily: 200,
  mobile_message_ip_burst: 40,
  mobile_message_ip_daily: 600,
  // Dispute photo uploads. Each one puts up to 10 MB into the job-media bucket
  // that we then store forever, so the bucket — not CPU — is what's being
  // protected. A dispute takes at most MAX_DISPUTE_PHOTOS (6) images.
  mobile_upload_user_burst: 10,
  mobile_upload_user_daily: 60,
  mobile_upload_ip_burst: 20,
  mobile_upload_ip_daily: 200,
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
