"use server";

import { headers } from "next/headers";
import {
  applyManualVehicleSelection,
  listMakes,
  listModels,
  listTypes,
  type ManualVehicleResult,
  type PickerMake,
  type PickerModel,
  type PickerType,
} from "@/lib/haynespro/vehicle-picker";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DAY_SECONDS,
  MINUTE_SECONDS,
  type RateLimitRule,
  enforceRateLimits,
} from "@/lib/rate-limit/limiter";

// The website's half of manual vehicle selection (Task 20 Stage 2).
//
// The app reaches this through `app/api/mobile/v1/vehicle/**`; the web funnel
// reaches it through these actions. Both are thin — every one of them is a call
// into `lib/haynespro/vehicle-picker.ts`, which is where the cascade and the
// guards actually live. That is the point: the website and the app must not be
// able to disagree about which car a registration is, because they price from
// the same cache row.
//
// ⚠️ A `"use server"` export is a PUBLIC ENDPOINT — anyone can POST to it, with
// or without a session, exactly like the route handlers. So these carry the
// same rate limits as their mobile twins and, in `selectVehicleManually`, the
// same guards.

/** Best-effort client IP. Same reasoning as `clientIp` in lib/mobile/respond.ts. */
async function callerIp(): Promise<string> {
  const h = await headers();
  const first = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return first || h.get("x-real-ip")?.trim() || "unknown";
}

/** The signed-in customer, if there is one. Guests are normal here — see below. */
async function optionalUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Count a picker read against the catalogue buckets — the SAME buckets the
 * mobile catalogue endpoints use, deliberately. The keys are named for where
 * they were introduced, but a HaynesPro call costs the same whichever client
 * makes it, and the global daily is the ceiling on the whole supplier bill.
 */
async function limitRead(userId: string | null): Promise<boolean> {
  const ip = await callerIp();
  const rules: RateLimitRule[] = [];
  if (userId) {
    rules.push(
      { key: "mobile_catalogue_user_burst", subject: `user:${userId}`, windowSeconds: MINUTE_SECONDS },
      { key: "mobile_catalogue_user_daily", subject: `user:${userId}`, windowSeconds: DAY_SECONDS },
    );
  }
  rules.push(
    { key: "mobile_catalogue_ip_burst", subject: `ip:${ip}`, windowSeconds: MINUTE_SECONDS },
    { key: "mobile_catalogue_ip_daily", subject: `ip:${ip}`, windowSeconds: DAY_SECONDS },
    { key: "mobile_catalogue_global_daily", subject: "global", windowSeconds: DAY_SECONDS },
  );
  return (await enforceRateLimits(rules)).allowed;
}

// ---------------------------------------------------------------------------
// The cascade. Null means "we can't show you a list" — the picker renders that
// as an outage rather than as a car with no variants.
// ---------------------------------------------------------------------------

export async function loadVehicleMakes(): Promise<PickerMake[] | null> {
  if (!(await limitRead(await optionalUserId()))) return null;
  return listMakes();
}

export async function loadVehicleModels(makeId: number): Promise<PickerModel[] | null> {
  if (!Number.isSafeInteger(makeId) || makeId <= 0) return null;
  if (!(await limitRead(await optionalUserId()))) return null;
  return listModels(makeId);
}

export async function loadVehicleTypes(modelId: number): Promise<PickerType[] | null> {
  if (!Number.isSafeInteger(modelId) || modelId <= 0) return null;
  if (!(await limitRead(await optionalUserId()))) return null;
  return listTypes(modelId);
}

// ---------------------------------------------------------------------------
// The correction.
// ---------------------------------------------------------------------------

/**
 * Point a registration at the car type the customer picked.
 *
 * **Guests may call this, and that is the considered choice.** The web funnel
 * lets people price a job before making an account, so the moment a customer
 * spots the wrong car — step 1 or 2 — is a moment they are usually anonymous.
 * Requiring a sign-in to correct it would gate the funnel exactly where it
 * hurts, and would leave the wrong price standing for everyone who declines.
 *
 * What makes that safe is that the DVLA make guard inside
 * `applyManualVehicleSelection` does not depend on who is calling: the chosen
 * type's make must match the make DVLA holds for the reg, so the worst an
 * anonymous caller can do to a plate is move it to a different variant of its
 * own make. `resolved_by` is null for a guest, `resolved_at` is still stamped,
 * and the rate limits below are the abuse ceiling.
 *
 * If we ever want this signed-in only, this function is the one place to say so.
 */
export async function selectVehicleManually(
  reg: string,
  carTypeId: number,
): Promise<ManualVehicleResult> {
  if (typeof reg !== "string" || !reg.trim()) {
    return { ok: false, code: "vehicle_unknown", error: "Enter your registration number." };
  }
  if (!Number.isSafeInteger(carTypeId) || carTypeId <= 0) {
    return {
      ok: false,
      code: "type_unknown",
      error: "Please choose your vehicle from the list.",
    };
  }

  const userId = await optionalUserId();
  const ip = await callerIp();

  // The `vehicle` family — tighter than the read buckets, because this is the
  // only customer-reachable WRITE to shared pricing state.
  const rules: RateLimitRule[] = [];
  if (userId) {
    rules.push(
      { key: "mobile_vehicle_user_burst", subject: `user:${userId}`, windowSeconds: MINUTE_SECONDS },
      { key: "mobile_vehicle_user_daily", subject: `user:${userId}`, windowSeconds: DAY_SECONDS },
    );
  }
  rules.push(
    { key: "mobile_vehicle_ip_burst", subject: `ip:${ip}`, windowSeconds: MINUTE_SECONDS },
    { key: "mobile_vehicle_ip_daily", subject: `ip:${ip}`, windowSeconds: DAY_SECONDS },
  );

  if (!(await enforceRateLimits(rules)).allowed) {
    return {
      ok: false,
      code: "unavailable",
      error: "You've changed your vehicle a few times just now. Please wait a moment and try again.",
    };
  }

  return applyManualVehicleSelection(
    { reg, carTypeId, callerId: userId },
    createAdminClient(),
  );
}
