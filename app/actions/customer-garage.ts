"use server";

import { headers } from "next/headers";
import { addToGarage, removeGarageVehicle, renameGarageVehicle } from "@/lib/garage/garage";
import { DAY_SECONDS, MINUTE_SECONDS, enforceRateLimits } from "@/lib/rate-limit/limiter";
import { createClient } from "@/lib/supabase/server";

// The website's garage (Task 48, Task 50). Thin wrappers over lib/garage/garage.ts,
// which the mobile routes use too. Every export of a "use server" file is a
// public endpoint, so each one resolves the caller from the cookie session and
// checks its arguments at runtime; nothing from the browser says whose garage
// it is. Adding costs a DVLA lookup, so it counts against the same `account`
// rate-limit family as POST /api/mobile/v1/garage. Rename and remove are plain
// writes under RLS, as the app does them directly.

export type GarageActionResult = { ok: true } | { ok: false; error: string };

const SIGNED_OUT = "Your session has ended. Please sign in again.";
const NOT_FOUND = "We couldn't find that vehicle in your garage.";
const RATE_LIMITED = "You've tried that a few times just now. Please wait a moment and try again.";
const UUID = /^[0-9a-f-]{36}$/i;

async function caller() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** The `account` family, as enforceBookingLimits applies it to the mobile routes. */
async function accountLimitAllows(userId: string): Promise<boolean> {
  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip")?.trim() || "unknown";
  const verdict = await enforceRateLimits([
    { key: "mobile_account_user_burst", subject: `user:${userId}`, windowSeconds: MINUTE_SECONDS },
    { key: "mobile_account_user_daily", subject: `user:${userId}`, windowSeconds: DAY_SECONDS },
    { key: "mobile_account_ip_burst", subject: `ip:${ip}`, windowSeconds: MINUTE_SECONDS },
    { key: "mobile_account_ip_daily", subject: `ip:${ip}`, windowSeconds: DAY_SECONDS },
  ]);
  return verdict.allowed;
}

/** Add a vehicle, checked with DVLA. Adding one that's already there succeeds quietly. */
export async function addGarageVehicle(input: { registration: string; nickname?: string }): Promise<GarageActionResult> {
  const { user } = await caller();
  if (!user) return { ok: false, error: SIGNED_OUT };

  const body = input && typeof input === "object" ? input : { registration: "" };
  if (!(await accountLimitAllows(user.id))) return { ok: false, error: RATE_LIMITED };

  const result = await addToGarage(user.id, { registration: body.registration, nickname: body.nickname });
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function renameVehicle(id: string, nickname: string): Promise<GarageActionResult> {
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, error: NOT_FOUND };
  const { supabase, user } = await caller();
  if (!user) return { ok: false, error: SIGNED_OUT };
  return renameGarageVehicle(supabase, id, typeof nickname === "string" ? nickname : "");
}

export async function removeVehicle(id: string): Promise<GarageActionResult> {
  if (typeof id !== "string" || !UUID.test(id)) return { ok: false, error: NOT_FOUND };
  const { supabase, user } = await caller();
  if (!user) return { ok: false, error: SIGNED_OUT };
  return removeGarageVehicle(supabase, id);
}
