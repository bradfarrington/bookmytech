import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { accountFlags } from "@/lib/stripe/connect";
import { createAdminClient } from "@/lib/supabase/admin";

// Stripe webhook handler (Task 08 Stage 3). The source of truth for keeping the
// mechanics.stripe_* capability flags in sync as the mechanic completes (or
// updates) their Connect onboarding.
//
// Set STRIPE_WEBHOOK_SECRET (from `stripe listen` locally, or the dashboard
// endpoint signing secret in prod) so signatures are verified. Stripe needs the
// raw body, so we read req.text() and never parse JSON first.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET not set — rejecting webhook.");
    return new NextResponse("Webhook not configured", { status: 500 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return new NextResponse("Missing signature", { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "bad signature";
    return new NextResponse(`Webhook signature failed: ${message}`, { status: 400 });
  }

  try {
    if (event.type === "account.updated") {
      await syncAccount(event.data.object as Stripe.Account);
    }
    // Other event types are acknowledged but not acted on.
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook handler error", event.type, err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

async function syncAccount(account: Stripe.Account) {
  const flags = accountFlags(account);
  const admin = createAdminClient();
  const { error } = await admin
    .from("mechanics")
    .update({
      stripe_charges_enabled: flags.chargesEnabled,
      stripe_payouts_enabled: flags.payoutsEnabled,
      stripe_onboarding_complete: flags.onboardingComplete,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_account_id", account.id);
  if (error) console.error("Failed to sync mechanic from account.updated", error);
}
