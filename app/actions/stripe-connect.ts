"use server";

import { requireMechanic as requireMechanicRow } from "@/lib/mechanics/require-mechanic";
import {
  refreshStripeStatusFor,
  startStripeOnboardingFor,
} from "@/lib/mechanics/stripe-onboarding";

// Mechanic-side Stripe Connect onboarding (Task 08 Stage 3).
//
// startStripeOnboarding: ensure the mechanic has a connected account, then mint
// a fresh Stripe-hosted onboarding link and hand its URL back to the client to
// redirect to. refreshStripeStatus: pull the live account and re-sync the
// capability flags (used when the mechanic returns from Stripe — the webhook is
// the source of truth in production, this just makes the return snappy).
//
// The work itself lives in lib/mechanics/stripe-onboarding.ts, shared with the
// mechanic app's route handlers (app/api/mobile/v1/mechanic/stripe/*). These
// actions only resolve the mechanic from the cookie session.

export type StripeConnectResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

async function requireMechanic() {
  const guard = await requireMechanicRow();
  if (!guard.ok) return guard;
  const {
    data: { user },
  } = await guard.supabase.auth.getUser();
  return { ok: true as const, userId: guard.mechanicId, email: user?.email ?? null };
}

export async function startStripeOnboarding(): Promise<StripeConnectResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  return startStripeOnboardingFor({ userId: guard.userId, email: guard.email });
}

export async function refreshStripeStatus(): Promise<
  { ok: true; payoutsEnabled: boolean } | { ok: false; error: string }
> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;

  const result = await refreshStripeStatusFor(guard.userId);
  if (!result.ok) return result;
  if (!result.hasAccount)
    return { ok: false, error: "No payout account yet. Start onboarding first." };
  return { ok: true, payoutsEnabled: result.payoutsEnabled };
}
