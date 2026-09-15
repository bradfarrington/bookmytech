"use server";

import { headers } from "next/headers";
import { DAY_SECONDS, MINUTE_SECONDS, enforceRateLimits } from "@/lib/rate-limit/limiter";
import { removeSavedCard, setDefaultCard, startAddingCard } from "@/lib/payments/saved-cards";
import { createClient } from "@/lib/supabase/server";

// The website's Payment methods (Task 48, Task 53). Thin wrappers over
// lib/payments/saved-cards.ts, which the mobile endpoints use too. The profile
// comes from the cookie session; a card id from the browser is checked against
// the caller's own Stripe Customer inside the lib before anything touches it.
// Every call is a Stripe API call, so all three count against the same
// `account` rate-limit family as /api/mobile/v1/account/payment-methods.

export type StartCardResult = { ok: true; setupIntentClientSecret: string } | { ok: false; error: string };
export type CardActionResult = { ok: true } | { ok: false; error: string };

const SIGNED_OUT = "Your session has ended. Please sign in again.";
const RATE_LIMITED = "You've tried that a few times just now. Please wait a moment and try again.";
const NOT_FOUND = "We couldn't find that card.";

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

/** A SetupIntent for the web card form to confirm. */
export async function startAddingSavedCard(): Promise<StartCardResult> {
  const { supabase, user } = await caller();
  if (!user) return { ok: false, error: SIGNED_OUT };
  if (!(await accountLimitAllows(user.id))) return { ok: false, error: RATE_LIMITED };

  // The name Stripe shows against the customer. Read under the caller's own RLS.
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
  const name = (profile?.full_name as string | null | undefined)?.trim() || null;

  const result = await startAddingCard({ userId: user.id, email: user.email ?? null, name }, "web");
  return result.ok ? { ok: true, setupIntentClientSecret: result.setupIntentClientSecret } : { ok: false, error: result.error };
}

export async function removeCard(paymentMethodId: string): Promise<CardActionResult> {
  if (typeof paymentMethodId !== "string") return { ok: false, error: NOT_FOUND };
  const { user } = await caller();
  if (!user) return { ok: false, error: SIGNED_OUT };
  if (!(await accountLimitAllows(user.id))) return { ok: false, error: RATE_LIMITED };
  const result = await removeSavedCard(user.id, paymentMethodId);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function makeCardDefault(paymentMethodId: string): Promise<CardActionResult> {
  if (typeof paymentMethodId !== "string") return { ok: false, error: NOT_FOUND };
  const { user } = await caller();
  if (!user) return { ok: false, error: SIGNED_OUT };
  if (!(await accountLimitAllows(user.id))) return { ok: false, error: RATE_LIMITED };
  const result = await setDefaultCard(user.id, paymentMethodId);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
