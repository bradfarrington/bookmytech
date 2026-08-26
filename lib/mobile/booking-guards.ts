import "server-only";

// Shared guards for the two authenticated mobile booking endpoints
// (/checkout/prepare and /bookings). Both answer the same two questions before
// doing any work: may this caller book at all, and are they going too fast?

import { apiError, apiRateLimited, clientIp } from "@/lib/mobile/respond";
import type { MobileCaller } from "@/lib/supabase/mobile";
import {
  DAY_SECONDS,
  MINUTE_SECONDS,
  type RateLimitRule,
  enforceRateLimits,
} from "@/lib/rate-limit/limiter";

/**
 * Staff accounts can't book.
 *
 * Same rule the web funnel enforces (app/(customer)/book/slot/page.tsx treats an
 * admin or mechanic session as `wrongRole` and asks them to sign out): a booking
 * made under a staff id would be invisible to them, because proxy keeps
 * them out of the customer dashboard. Silently writing it would be worse than
 * refusing.
 *
 * A null role means no profile row, which the web page also reads as "customer" —
 * matched here rather than being stricter, so the two clients can't disagree
 * about who is allowed to book.
 */
export function staffRefusal(caller: MobileCaller): Response | null {
  if (caller.role === "admin" || caller.role === "mechanic") {
    return apiError(
      "You're signed in with a staff account, which can't book a repair. " +
        "Sign out and sign in with your customer account.",
      403,
    );
  }
  return null;
}

/**
 * Which bucket family a request counts against. Each has four keys in
 * RATE_LIMIT_DEFAULTS named `mobile_<family>_{user,ip}_{burst,daily}` — the
 * template literal below is checked against `RateLimitKey`, so adding a family
 * here without seeding its four limits is a type error, not a runtime surprise.
 *
 *   checkout — pricing + opening the pre-auth hold
 *   booking  — writing the booking row
 *   action   — managing a booking afterwards (cancel, reschedule, review,
 *              dispute open/withdraw, releasing a stranded hold)
 *   message  — dispute thread messages
 *   upload   — dispute photos
 */
export type MobileLimitFamily = "checkout" | "booking" | "action" | "message" | "upload";

/**
 * Count this request against its bucket family. Returns a ready-to-return 429
 * when it should be refused, or null to carry on.
 *
 * The families are separate on purpose: browsing repairs and paying for one
 * shouldn't share a budget, or a customer who spent a while looking around would
 * be turned away at the payment step — the single worst moment to show someone
 * "please wait a moment". Same reasoning splits arguing in a dispute thread from
 * cancelling a job.
 *
 * Per-user first so the refusal we report is the one that actually applies to
 * this caller. The per-IP buckets stay deliberately generous: mobile carriers put
 * many customers behind one CGNAT address, so they are an abuse ceiling for one
 * attacker cycling accounts, not a per-customer quota.
 */
export async function enforceBookingLimits(
  request: Request,
  caller: MobileCaller,
  kind: MobileLimitFamily,
): Promise<Response | null> {
  const ip = clientIp(request);
  const user = `user:${caller.userId}`;
  const rules: RateLimitRule[] = [
    { key: `mobile_${kind}_user_burst`, subject: user, windowSeconds: MINUTE_SECONDS },
    { key: `mobile_${kind}_user_daily`, subject: user, windowSeconds: DAY_SECONDS },
    { key: `mobile_${kind}_ip_burst`, subject: `ip:${ip}`, windowSeconds: MINUTE_SECONDS },
    { key: `mobile_${kind}_ip_daily`, subject: `ip:${ip}`, windowSeconds: DAY_SECONDS },
  ];

  const verdict = await enforceRateLimits(rules);
  if (verdict.allowed) return null;

  return apiRateLimited(
    "You've tried that a few times just now. Please wait a moment and try again.",
    verdict.retryAfterSeconds,
  );
}
