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
 *
 * Both default to the web onboarding page. The mechanic app passes its own
 * (lib/mechanics/mobile-return.ts) — Stripe only accepts https here, so that is
 * a page of ours which bounces to the app's scheme.
 */
export async function createOnboardingLink(
  accountId: string,
  urls?: { returnUrl: string; refreshUrl: string },
): Promise<string> {
  const base = `${siteUrl()}/mechanic/onboarding/stripe`;
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: urls?.refreshUrl ?? `${base}?refresh=1`,
    return_url: urls?.returnUrl ?? `${base}?return=1`,
    type: "account_onboarding",
  });
  return link.url;
}

/** Fetch the live account so we can re-sync capability flags. */
export async function retrieveAccount(accountId: string): Promise<Stripe.Account> {
  return stripe.accounts.retrieve(accountId);
}

/**
 * A single-use link into the mechanic's Stripe Express dashboard, where the
 * bank account is changed and every transfer is itemised (Task 70).
 *
 * The mechanic app opens it in the in-app browser, the same as onboarding.
 * Stripe refuses this on an account that hasn't finished onboarding, so the
 * caller checks `stripe_payouts_enabled` first and says something readable.
 */
export async function createDashboardLink(accountId: string): Promise<string> {
  const link = await stripe.accounts.createLoginLink(accountId);
  return link.url;
}

/** Bank name and last four of the account Stripe pays out to. Nothing else. */
export interface ExternalBankAccount {
  bankName: string | null;
  last4: string | null;
}

/**
 * The connected account's default payout bank account, or null when they have
 * not added one yet. Deliberately narrow: the app shows "Barclays ••••4831" to
 * confirm where the money lands, and Stripe's own dashboard owns everything
 * else about it.
 */
export async function primaryExternalAccount(
  accountId: string,
): Promise<ExternalBankAccount | null> {
  const { data } = await stripe.accounts.listExternalAccounts(accountId, {
    object: "bank_account",
    limit: 10,
  });
  const accounts = data.filter(
    (a): a is Stripe.BankAccount => a.object === "bank_account",
  );
  const chosen = accounts.find((a) => a.default_for_currency) ?? accounts[0];
  if (!chosen) return null;
  return { bankName: chosen.bank_name ?? null, last4: chosen.last4 ?? null };
}

/** The real transfer history to this account, newest first. */
export async function listTransfersTo(
  accountId: string,
  limit = 12,
): Promise<Stripe.Transfer[]> {
  const { data } = await stripe.transfers.list({ destination: accountId, limit });
  return data;
}
