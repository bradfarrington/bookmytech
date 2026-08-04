import "server-only";

// Rate limiting shared by the three HaynesPro-backed mobile endpoints
// (/repairs/tree, /repairs/search, /quote).
//
// Same reasoning as /vehicle/lookup: these are unauthenticated, so anyone with
// the URL can call them, and every uncached call spends metered HaynesPro
// credit. A GET is not protected by our refusal to answer preflights the way a
// JSON POST is — a page on any origin can trigger one from a victim's browser
// (it can't read the reply, but it can still cost us) — so these limits are the
// cost ceiling, not a nicety.
//
// Values live in platform_settings (migration 0044), tunable without a redeploy.

import { apiRateLimited, clientIp } from "@/lib/mobile/respond";
import { optionalMobileUser } from "@/lib/supabase/mobile";
import {
  DAY_SECONDS,
  MINUTE_SECONDS,
  type RateLimitRule,
  enforceRateLimits,
} from "@/lib/rate-limit/limiter";

/**
 * Count this request against the catalogue buckets. Returns a ready-to-return
 * 429 when it should be refused, or null to carry on.
 *
 * `search` adds the tighter search-only buckets on top, because one search can
 * walk dozens of tree levels where a browse costs one.
 */
export async function enforceCatalogueLimits(
  request: Request,
  { search = false }: { search?: boolean } = {},
): Promise<Response | null> {
  // Identify a signed-in caller if there is one, but never require it — the app
  // lets people price a job before making an account. A signed-in caller gets
  // their own bucket, which is fairer than per-IP when a mobile carrier puts
  // many customers behind one CGNAT address.
  const caller = await optionalMobileUser(request);
  const ip = clientIp(request);

  // Most specific first, so the refusal we report is the one that actually
  // applies to this caller rather than a shared bucket they can't influence.
  const rules: RateLimitRule[] = [];

  if (search) {
    if (caller) {
      rules.push(
        {
          key: "mobile_search_user_burst",
          subject: `user:${caller.userId}`,
          windowSeconds: MINUTE_SECONDS,
        },
        {
          key: "mobile_search_user_daily",
          subject: `user:${caller.userId}`,
          windowSeconds: DAY_SECONDS,
        },
      );
    }
    rules.push(
      { key: "mobile_search_ip_burst", subject: `ip:${ip}`, windowSeconds: MINUTE_SECONDS },
      { key: "mobile_search_ip_daily", subject: `ip:${ip}`, windowSeconds: DAY_SECONDS },
    );
  }

  if (caller) {
    rules.push(
      {
        key: "mobile_catalogue_user_burst",
        subject: `user:${caller.userId}`,
        windowSeconds: MINUTE_SECONDS,
      },
      {
        key: "mobile_catalogue_user_daily",
        subject: `user:${caller.userId}`,
        windowSeconds: DAY_SECONDS,
      },
    );
  }
  rules.push(
    { key: "mobile_catalogue_ip_burst", subject: `ip:${ip}`, windowSeconds: MINUTE_SECONDS },
    { key: "mobile_catalogue_ip_daily", subject: `ip:${ip}`, windowSeconds: DAY_SECONDS },
    { key: "mobile_catalogue_global_daily", subject: "global", windowSeconds: DAY_SECONDS },
  );

  const verdict = await enforceRateLimits(rules);
  if (verdict.allowed) return null;

  const message =
    verdict.key === "mobile_catalogue_global_daily"
      ? "Repair prices are temporarily unavailable. Please try again later."
      : "You've made a lot of requests just now. Please wait a moment and try again.";
  return apiRateLimited(message, verdict.retryAfterSeconds);
}
