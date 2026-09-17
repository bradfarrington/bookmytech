import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe Connect onboarding for a mechanic, shared by the website's server
// actions (app/actions/stripe-connect.ts) and the mechanic app's route handlers
// (app/api/mobile/v1/mechanic/stripe/*).
//
// Neither function resolves WHO the mechanic is — the caller does that, from a
// cookie session or a bearer token, and passes the id in. Everything here runs
// on the service role: `stripe_account_id` and the capability flags are not
// writable by the mechanic's own session (migration 0081).

export type StartOnboardingResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Ensure the mechanic has a connected account, then mint a fresh Stripe-hosted
 * onboarding link. `urls` overrides where Stripe sends them afterwards; omitted,
 * it is the web onboarding page.
 */
export async function startStripeOnboardingFor(
  mechanic: { userId: string; email: string | null },
  urls?: { returnUrl: string; refreshUrl: string },
): Promise<StartOnboardingResult> {
  // Lazy-import so the app still runs without STRIPE_SECRET_KEY in dev.
  let connect: typeof import("@/lib/stripe/connect");
  try {
    connect = await import("@/lib/stripe/connect");
  } catch {
    return { ok: false, error: "Payments aren't configured. Add STRIPE_SECRET_KEY." };
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("mechanics")
    .select("stripe_account_id")
    .eq("id", mechanic.userId)
    .single();

  try {
    let accountId = row?.stripe_account_id ?? null;
    if (!accountId) {
      accountId = await connect.createConnectedAccount(mechanic.email);
      const { error } = await admin
        .from("mechanics")
        .update({ stripe_account_id: accountId, updated_at: new Date().toISOString() })
        .eq("id", mechanic.userId);
      if (error) return { ok: false, error: error.message };
    }

    const url = await connect.createOnboardingLink(accountId, urls);
    return { ok: true, url };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't set up payouts. Please try again.";
    return { ok: false, error: message };
  }
}

export type RefreshStripeResult =
  /** `hasAccount: false` — onboarding was never started, so there is nothing to read. */
  | { ok: true; payoutsEnabled: boolean; hasAccount: boolean }
  | { ok: false; error: string };

/**
 * Pull the live account and re-sync the capability flags. Used when the
 * mechanic returns from Stripe — the webhook is the source of truth in
 * production, this just makes the return snappy.
 */
export async function refreshStripeStatusFor(userId: string): Promise<RefreshStripeResult> {
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
    .eq("id", userId)
    .single();
  if (!mechanic?.stripe_account_id) return { ok: true, payoutsEnabled: false, hasAccount: false };

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

    await admin.from("mechanics").update(patch).eq("id", userId);

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
    return { ok: true, payoutsEnabled: flags.payoutsEnabled, hasAccount: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't refresh payout status. Please try again.";
    return { ok: false, error: message };
  }
}
