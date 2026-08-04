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
 * made under a staff id would be invisible to them, because middleware keeps
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
 * Count this request against the checkout or booking buckets. Returns a
 * ready-to-return 429 when it should be refused, or null to carry on.
 *
 * These are separate from the catalogue buckets on purpose: browsing repairs and
 * paying for one shouldn't share a budget, or a customer who spent a while
 * looking around would be turned away at the payment step — the single worst
 * moment to show someone "please wait a moment".
 *
 * Per-user first so the refusal we report is the one that actually applies to
 * this caller. The per-IP buckets stay deliberately generous: mobile carriers put
 * many customers behind one CGNAT address, so they are an abuse ceiling for one
 * attacker cycling accounts, not a per-customer quota.
 */
export async function enforceBookingLimits(
  request: Request,
  caller: MobileCaller,
  kind: "checkout" | "booking",
): Promise<Response | null> {
  const ip = clientIp(request);
  const rules: RateLimitRule[] =
    kind === "checkout"
      ? [
          {
            key: "mobile_checkout_user_burst",
            subject: `user:${caller.userId}`,
            windowSeconds: MINUTE_SECONDS,
          },
          {
            key: "mobile_checkout_user_daily",
            subject: `user:${caller.userId}`,
            windowSeconds: DAY_SECONDS,
          },
          { key: "mobile_checkout_ip_burst", subject: `ip:${ip}`, windowSeconds: MINUTE_SECONDS },
          { key: "mobile_checkout_ip_daily", subject: `ip:${ip}`, windowSeconds: DAY_SECONDS },
        ]
      : [
          {
            key: "mobile_booking_user_burst",
            subject: `user:${caller.userId}`,
            windowSeconds: MINUTE_SECONDS,
          },
          {
            key: "mobile_booking_user_daily",
            subject: `user:${caller.userId}`,
            windowSeconds: DAY_SECONDS,
          },
          { key: "mobile_booking_ip_burst", subject: `ip:${ip}`, windowSeconds: MINUTE_SECONDS },
          { key: "mobile_booking_ip_daily", subject: `ip:${ip}`, windowSeconds: DAY_SECONDS },
        ];

  const verdict = await enforceRateLimits(rules);
  if (verdict.allowed) return null;

  return apiRateLimited(
    "You've tried that a few times just now. Please wait a moment and try again.",
    verdict.retryAfterSeconds,
  );
}
