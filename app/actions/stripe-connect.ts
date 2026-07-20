"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMechanic as requireMechanicRow } from "@/lib/mechanics/require-mechanic";

// Mechanic-side Stripe Connect onboarding (Task 08 Stage 3).
//
// startStripeOnboarding: ensure the mechanic has a connected account, then mint
// a fresh Stripe-hosted onboarding link and hand its URL back to the client to
// redirect to. refreshStripeStatus: pull the live account and re-sync the
// capability flags (used when the mechanic returns from Stripe — the webhook is
// the source of truth in production, this just makes the return snappy).

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

  // Lazy-import so the app still runs without STRIPE_SECRET_KEY in dev.
  let connect: typeof import("@/lib/stripe/connect");
  try {
    connect = await import("@/lib/stripe/connect");
  } catch {
    return { ok: false, error: "Payments aren't configured. Add STRIPE_SECRET_KEY." };
  }

  const admin = createAdminClient();
  const { data: mechanic } = await admin
    .from("mechanics")
    .select("stripe_account_id")
    .eq("id", guard.userId)
    .single();

  try {
    let accountId = mechanic?.stripe_account_id ?? null;
    if (!accountId) {
      accountId = await connect.createConnectedAccount(guard.email);
      const { error } = await admin
        .from("mechanics")
        .update({ stripe_account_id: accountId, updated_at: new Date().toISOString() })
        .eq("id", guard.userId);
      if (error) return { ok: false, error: error.message };
    }

    const url = await connect.createOnboardingLink(accountId);
    return { ok: true, url };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't set up payouts. Please try again.";
    return { ok: false, error: message };
  }
}

export async function refreshStripeStatus(): Promise<
  { ok: true; payoutsEnabled: boolean } | { ok: false; error: string }
> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;

  let connect: typeof import("@/lib/stripe/connect");
  try {
    connect = await import("@/lib/stripe/connect");
  } catch {
    return { ok: false, error: "Payments aren't configured." };
  }

  const admin = createAdminClient();
  const { data: mechanic } = await admin
    .from("mechanics")
    .select("stripe_account_id, stripe_payouts_enabled, status")
    .eq("id", guard.userId)
    .single();
  if (!mechanic?.stripe_account_id)
    return { ok: false, error: "No payout account yet — start onboarding first." };

  try {
    const account = await connect.retrieveAccount(mechanic.stripe_account_id);
    const flags = connect.accountFlags(account);

    // Auto-go-online the moment payouts first become enabled, so a freshly
    // approved mechanic is available for jobs straight after connecting their
    // bank — no separate "go online" step. We only do this on the
    // disabled→enabled transition, so re-checking status later won't force a
    // mechanic who has deliberately gone offline back online.
    const justEnabled = flags.payoutsEnabled && !mechanic.stripe_payouts_enabled;
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      stripe_charges_enabled: flags.chargesEnabled,
      stripe_payouts_enabled: flags.payoutsEnabled,
      stripe_onboarding_complete: flags.onboardingComplete,
      updated_at: now,
    };
    if (justEnabled && mechanic.status !== "online") {
      patch.status = "online";
      patch.online_at = now;
      patch.last_seen_at = now;
    }

    await admin.from("mechanics").update(patch).eq("id", guard.userId);

    // Now that they're online, pull in any job that was waiting for a mechanic.
    if (justEnabled) {
      try {
        await (await import("@/lib/dispatch/dispatch")).redispatchPending();
      } catch (err) {
        console.error("redispatch after auto-online failed", err);
      }
    }

    revalidatePath("/mechanic/onboarding/stripe");
    revalidatePath("/mechanic/jobs");
    return { ok: true, payoutsEnabled: flags.payoutsEnabled };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't refresh payout status. Please try again.";
    return { ok: false, error: message };
  }
}
