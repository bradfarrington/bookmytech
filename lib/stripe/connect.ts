import "server-only";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe/server";
import { siteUrl } from "@/lib/utils";

// Stripe Connect Express helpers (Task 08 Stage 3). The platform takes the
// customer's payment on its own account and pays mechanics out via transfers to
// their connected Express accounts. These helpers create/refresh the account
// and the Stripe-hosted onboarding link.

/** Capability flags we mirror onto the mechanics row. */
export interface StripeAccountFlags {
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  // We treat onboarding as "complete" once Stripe can pay the mechanic out.
  onboardingComplete: boolean;
}

export function accountFlags(account: Stripe.Account): StripeAccountFlags {
  const chargesEnabled = Boolean(account.charges_enabled);
  const payoutsEnabled = Boolean(account.payouts_enabled);
  return {
    chargesEnabled,
    payoutsEnabled,
    onboardingComplete: Boolean(account.details_submitted) && payoutsEnabled,
  };
}

/**
 * Create a GB Express connected account for a mechanic. Caller persists the
 * returned id onto mechanics.stripe_account_id.
 */
export async function createConnectedAccount(email?: string | null): Promise<string> {
  const account = await stripe.accounts.create({
    type: "express",
    country: "GB",
    email: email ?? undefined,
    business_type: "individual",
    capabilities: {
      transfers: { requested: true },
    },
    business_profile: {
      product_description: "Mobile mechanic services via Book My Tech",
    },
  });
  return account.id;
}

/**
 * A fresh Stripe-hosted onboarding link. These are single-use and short-lived,
 * so we mint a new one each time the mechanic starts/continues onboarding.
 * `refresh_url` is hit when the link expires; `return_url` when they finish.
 */
export async function createOnboardingLink(accountId: string): Promise<string> {
  const base = `${siteUrl()}/mechanic/onboarding/stripe`;
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${base}?refresh=1`,
    return_url: `${base}?return=1`,
    type: "account_onboarding",
  });
  return link.url;
}

/** Fetch the live account so we can re-sync capability flags. */
export async function retrieveAccount(accountId: string): Promise<Stripe.Account> {
  return stripe.accounts.retrieve(accountId);
}
