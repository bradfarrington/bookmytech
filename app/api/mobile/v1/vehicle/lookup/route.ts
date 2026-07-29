import { lookupVehicleAction } from "@/app/actions/lookup-vehicle";
import type { LookupResult } from "@/lib/dvla/types";
import { optionalMobileUser } from "@/lib/supabase/mobile";
import { apiError, apiOk, apiRateLimited, clientIp, readJsonBody } from "@/lib/mobile/respond";
import {
  DAY_SECONDS,
  MINUTE_SECONDS,
  type RateLimitRule,
  enforceRateLimits,
} from "@/lib/rate-limit/limiter";

// POST /api/mobile/v1/vehicle/lookup — reg → vehicle details. Unauthenticated.
//
// Body: { reg }
// 200:  the LookupResult from lib/dvla/types.ts, UNCHANGED — including the
//       `{ ok: false, code, message }` arm. A reg DVLA doesn't recognise is a
//       successful lookup with a negative answer, not a failed request, and the
//       app types against that union. Only transport-level problems (bad body,
//       rate limit) return `{ error }` with a non-2xx status.
//
// The app lets guests price a job before making an account, so anyone with the
// URL can call this — and EVERY MISS SPENDS MONEY: DVLA VES and DVSA MOT are
// both billed per call. The in-memory cache inside lookupVehicleAction is
// per-serverless-instance and will not protect us; a cold instance starts empty,
// and a caller looping regs never repeats one anyway. Hence the real limits
// below (lib/rate-limit/limiter.ts, migration 0043), tunable in
// platform_settings without a redeploy:
//
//   per user   6 / minute,  50 / day   (when a valid Bearer token is present)
//   per IP    10 / minute, 200 / day
//   globally             5000 / day    — the ceiling on what a distributed
//                                        attack can bill us in 24 hours
//
// Per-IP alone would be too weak (trivially rotated) and too strong (mobile
// carriers put many customers behind one CGNAT address), which is why a signed-
// in caller gets their own tighter bucket and everyone shares a global ceiling.

interface LookupBody {
  reg?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<LookupBody>(request);
  if (!parsed.ok) return parsed.response;

  const reg = typeof parsed.body.reg === "string" ? parsed.body.reg.trim() : "";
  if (!reg) {
    return apiError("Enter your registration number.", 400);
  }

  // Identify a signed-in caller if there is one, but never require it.
  const caller = await optionalMobileUser(request);
  const ip = clientIp(request);

  // Most specific first, so the refusal we report is the one that actually
  // applies to this caller rather than a shared bucket they can't influence.
  const rules: RateLimitRule[] = [];
  if (caller) {
    rules.push(
      {
        key: "mobile_lookup_user_burst",
        subject: `user:${caller.userId}`,
        windowSeconds: MINUTE_SECONDS,
      },
      {
        key: "mobile_lookup_user_daily",
        subject: `user:${caller.userId}`,
        windowSeconds: DAY_SECONDS,
      },
    );
  }
  rules.push(
    { key: "mobile_lookup_ip_burst", subject: `ip:${ip}`, windowSeconds: MINUTE_SECONDS },
    { key: "mobile_lookup_ip_daily", subject: `ip:${ip}`, windowSeconds: DAY_SECONDS },
    { key: "mobile_lookup_global_daily", subject: "global", windowSeconds: DAY_SECONDS },
  );

  const verdict = await enforceRateLimits(rules);
  if (!verdict.allowed) {
    const message =
      verdict.key === "mobile_lookup_global_daily"
        ? "Vehicle lookups are temporarily unavailable. Please try again later."
        : "You've looked up a lot of vehicles. Please wait a moment and try again.";
    return apiRateLimited(message, verdict.retryAfterSeconds);
  }

  const result: LookupResult = await lookupVehicleAction(reg);
  return apiOk(result);
}
