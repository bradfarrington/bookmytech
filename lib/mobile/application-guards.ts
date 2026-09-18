import "server-only";

// The guards for the two ANONYMOUS mechanic-application routes
// (app/api/mobile/v1/applications/**, Task 71). Everything else under
// /api/mobile/v1 either carries a Bearer token or a JSON body; an applicant has
// no account, and a document upload is multipart, so these routes need their
// own answer to "who is calling, and how often".

import type { ApplicationRefusal } from "@/lib/applications/validate";
import { apiError, apiRateLimited, clientIp } from "@/lib/mobile/respond";
import {
  DAY_SECONDS,
  MINUTE_SECONDS,
  enforceRateLimits,
  type RateLimitRule,
} from "@/lib/rate-limit/limiter";

const HOUR_SECONDS = 60 * MINUTE_SECONDS;

/** The header the mechanic app sends on every anonymous application request. */
export const CLIENT_HEADER = "x-bmt-client";
export const MECHANIC_APP_CLIENT = "mechanic-app";

/**
 * Refuse a request that doesn't carry `X-BMT-Client: mechanic-app`.
 *
 * This is the multipart route's stand-in for `readJsonBody`'s content-type
 * rule, and it works the same way: a custom header is not CORS-simple, so a
 * browser must preflight any cross-origin request carrying it, and no route
 * here answers a preflight. Without it, a page on any origin could post a
 * `multipart/form-data` form — a simple request, no preflight — and fill the
 * private bucket from its visitors' browsers.
 *
 * It is NOT authentication: anything that isn't a browser can send the header.
 * The IP limits below are what hold for those.
 */
export function requireAppClient(request: Request): Response | null {
  const value = request.headers.get(CLIENT_HEADER)?.trim().toLowerCase();
  if (value === MECHANIC_APP_CLIENT) return null;
  return apiError("Something went wrong. Please update the app and try again.", 400);
}

async function limit(rules: RateLimitRule[], message: string): Promise<Response | null> {
  const verdict = await enforceRateLimits(rules);
  if (verdict.allowed) return null;
  return apiRateLimited(message, verdict.retryAfterSeconds);
}

/** One person uploading five documents and replacing a couple. Fails closed. */
export function enforceApplicationDocLimits(request: Request): Promise<Response | null> {
  const ip = `ip:${clientIp(request)}`;
  return limit(
    [
      { key: "mobile_applydoc_ip_burst", subject: ip, windowSeconds: MINUTE_SECONDS },
      { key: "mobile_applydoc_ip_daily", subject: ip, windowSeconds: DAY_SECONDS },
      { key: "mobile_applydoc_global_daily", subject: "global", windowSeconds: DAY_SECONDS },
    ],
    "You've uploaded a lot of files just now. Please wait a moment and try again.",
  );
}

/** A handful of submits an hour, per IP, and a ceiling for everyone. Fails closed. */
export function enforceApplicationSubmitLimits(request: Request): Promise<Response | null> {
  const ip = `ip:${clientIp(request)}`;
  return limit(
    [
      { key: "mobile_apply_ip_hourly", subject: ip, windowSeconds: HOUR_SECONDS },
      { key: "mobile_apply_ip_daily", subject: ip, windowSeconds: DAY_SECONDS },
      { key: "mobile_apply_global_daily", subject: "global", windowSeconds: DAY_SECONDS },
    ],
    "Too many applications from this connection. Please wait a while and try again.",
  );
}

const STATUS = { invalid: 400, conflict: 409, failed: 500 } as const;

/**
 * A core refusal as a response. Unlike the mechanic routes' `refusalResponse`,
 * `failed` keeps its sentence: the application core writes its own
 * applicant-facing wording for a failure and logs the raw error itself.
 */
export function applicationRefusalResponse(refusal: ApplicationRefusal): Response {
  return apiError(refusal.error, STATUS[refusal.code]);
}
