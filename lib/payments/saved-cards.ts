import "server-only";

import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTable } from "@/lib/supabase/errors";

// Saved cards (Task 53). One implementation for the website's Payment methods
// page and the mobile endpoints under /api/mobile/v1/account/payment-methods.
//
// THE MODEL
//   • A profile gets a Stripe Customer the first time they add a card. Which
//     Customer is recorded in `stripe_customers` (0076): a service-role table,
//     never a profiles column, because customers can write profiles.
//   • Adding a card is a SetupIntent the client confirms (the website's
//     PaymentElement, or the app's PaymentSheet in setup mode). Stripe attaches
//     the card to the Customer when it succeeds; nothing here has to be told.
//   • The default is the Customer's invoice_settings.default_payment_method.
//     When there's none (a first card) or it was removed, the newest card
//     becomes the default the next time the cards are listed.
//   • Checkout (lib/bookings/create-booking.ts) makes its hold against the
//     Customer ONLY when they have a saved card (owner decision 2026-09-15), and
//     hands the client a CustomerSession so the saved cards are offered. A card
//     typed at checkout is not saved: saving happens on Payment methods.
//
// WHO: every function takes the profile id from the trusted layer (the cookie
// session or a verified Bearer token). A payment method id from a client is
// checked against the caller's own Customer before anything touches it.

type Admin = ReturnType<typeof createAdminClient>;
type StripeClient = Stripe;

export interface SavedCard {
  /** Stripe PaymentMethod id. */
  id: string;
  /** Stripe's card.brand: visa, mastercard, amex… */
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  holderName: string | null;
  isDefault: boolean;
}

export interface CardOwner {
  userId: string;
  email: string | null;
  name: string | null;
}

/** Where the card UI is: decides which CustomerSession component is enabled. */
export type CardSurface = "web" | "mobile";

export const MAX_SAVED_CARDS = 10;

export type CardsResult<T extends object> = ({ ok: true } & T) | { ok: false; error: string };

const UNAVAILABLE = "Saved cards aren't available yet. Please try again later.";
const FAILED = "We couldn't update your cards just now. Please try again.";

async function stripeClient(): Promise<StripeClient | null> {
  try {
    return (await import("@/lib/stripe/server")).stripe;
  } catch {
    return null;
  }
}

/** Test and live keys have separate Customers; a stored id is only good in its own mode. */
function livemode(): boolean {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  return key.startsWith("sk_live_") || key.startsWith("rk_live_");
}

export function isPaymentMethodId(value: string): boolean {
  return /^pm_[A-Za-z0-9]{6,}$/.test(value);
}

type CustomerLookup = { ok: true; customerId: string | null } | { ok: false; unavailable: boolean };

async function lookupCustomer(admin: Admin, profileId: string): Promise<CustomerLookup> {
  const { data, error } = await admin
    .from("stripe_customers")
    .select("stripe_customer_id")
    .eq("profile_id", profileId)
    .eq("livemode", livemode())
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return { ok: false, unavailable: true };
    console.error("[saved cards] customer lookup failed", profileId, error.message);
    return { ok: false, unavailable: false };
  }
  return { ok: true, customerId: (data?.stripe_customer_id as string | undefined) ?? null };
}

async function ensureCustomer(stripe: StripeClient, admin: Admin, owner: CardOwner): Promise<CardsResult<{ customerId: string }>> {
  const existing = await lookupCustomer(admin, owner.userId);
  if (!existing.ok) return { ok: false, error: existing.unavailable ? UNAVAILABLE : FAILED };
  if (existing.customerId) return { ok: true, customerId: existing.customerId };

  const mode = livemode();
  // The idempotency key makes two simultaneous first adds create ONE Customer.
  const customer = await stripe.customers.create(
    {
      email: owner.email ?? undefined,
      name: owner.name ?? undefined,
      metadata: { profile_id: owner.userId },
    },
    { idempotencyKey: `bmt-customer-${owner.userId}-${mode ? "live" : "test"}` },
  );

  const { error } = await admin
    .from("stripe_customers")
    .insert({ profile_id: owner.userId, livemode: mode, stripe_customer_id: customer.id });
  if (error && error.code !== "23505") {
    console.error("[saved cards] customer insert failed", owner.userId, error.message);
    return { ok: false, error: isMissingTable(error) ? UNAVAILABLE : FAILED };
  }
  return { ok: true, customerId: customer.id };
}

function toSavedCard(method: Stripe.PaymentMethod, defaultId: string | null): SavedCard | null {
  if (!method.card) return null;
  return {
    id: method.id,
    brand: method.card.brand,
    last4: method.card.last4,
    expMonth: method.card.exp_month,
    expYear: method.card.exp_year,
    holderName: method.billing_details?.name ?? null,
    isDefault: method.id === defaultId,
  };
}

/** The Customer's cards, newest first, with a default always set when there are any. */
async function cardsOf(stripe: StripeClient, admin: Admin, customerId: string): Promise<SavedCard[]> {
  const customer = await stripe.customers.retrieve(customerId);
  if ((customer as Stripe.DeletedCustomer).deleted) {
    // Deleted in the Stripe dashboard. Forget it so the next add makes a new one.
    await admin.from("stripe_customers").delete().eq("stripe_customer_id", customerId);
    return [];
  }
  const rawDefault = (customer as Stripe.Customer).invoice_settings?.default_payment_method;
  let defaultId = typeof rawDefault === "string" ? rawDefault : (rawDefault?.id ?? null);

  const methods = (
    await stripe.customers.listPaymentMethods(customerId, { type: "card", limit: MAX_SAVED_CARDS + 10 })
  ).data;

  if (methods.length > 0 && !methods.some((method) => method.id === defaultId)) {
    defaultId = methods[0].id;
    await stripe.customers
      .update(customerId, { invoice_settings: { default_payment_method: defaultId } })
      .catch((err: unknown) => console.error("[saved cards] default repair failed", customerId, err));
  }

  return methods
    .map((method) => toSavedCard(method, defaultId))
    .filter((card): card is SavedCard => card !== null);
}

function isMissingResource(err: unknown): boolean {
  return (err as { code?: string } | null)?.code === "resource_missing";
}

/** The caller's saved cards. No Customer yet means no cards, not an error. */
export async function listSavedCards(profileId: string): Promise<CardsResult<{ cards: SavedCard[] }>> {
  const admin = createAdminClient();
  const found = await lookupCustomer(admin, profileId);
  if (!found.ok) return found.unavailable ? { ok: true, cards: [] } : { ok: false, error: FAILED };
  if (!found.customerId) return { ok: true, cards: [] };

  const stripe = await stripeClient();
  if (!stripe) return { ok: false, error: "Payments aren't configured. Please try again shortly." };
  try {
    return { ok: true, cards: await cardsOf(stripe, admin, found.customerId) };
  } catch (err) {
    console.error("[saved cards] list failed", profileId, err);
    return { ok: false, error: "We couldn't load your cards just now. Please try again." };
  }
}

/**
 * Start adding a card: a SetupIntent on the caller's Customer, creating the
 * Customer first if this is their first card. The client confirms it.
 */
export async function startAddingCard(
  owner: CardOwner,
  surface: CardSurface,
): Promise<
  CardsResult<{ setupIntentClientSecret: string; customerId: string; customerSessionClientSecret: string | null }>
> {
  const stripe = await stripeClient();
  if (!stripe) return { ok: false, error: "Payments aren't configured. Please try again shortly." };
  const admin = createAdminClient();

  try {
    const customer = await ensureCustomer(stripe, admin, owner);
    if (!customer.ok) return customer;

    const existing = await cardsOf(stripe, admin, customer.customerId);
    if (existing.length >= MAX_SAVED_CARDS) {
      return {
        ok: false,
        error: `You can save up to ${MAX_SAVED_CARDS} cards. Remove one to add another.`,
      };
    }

    const intent = await stripe.setupIntents.create({
      customer: customer.customerId,
      payment_method_types: ["card"],
      // Cards are used with the customer present, at checkout.
      usage: "on_session",
      metadata: { profile_id: owner.userId },
    });
    if (!intent.client_secret) return { ok: false, error: FAILED };

    return {
      ok: true,
      setupIntentClientSecret: intent.client_secret,
      customerId: customer.customerId,
      customerSessionClientSecret: await customerSessionSecret(stripe, customer.customerId, surface),
    };
  } catch (err) {
    console.error("[saved cards] start add failed", owner.userId, err);
    return { ok: false, error: "We couldn't start adding a card just now. Please try again." };
  }
}

/** Resolve a payment method id to the caller's own card, or refuse. */
async function ownCard(
  stripe: StripeClient,
  admin: Admin,
  profileId: string,
  paymentMethodId: string,
): Promise<CardsResult<{ customerId: string }>> {
  const notFound = { ok: false as const, error: "We couldn't find that card." };
  if (!isPaymentMethodId(paymentMethodId)) return notFound;

  const found = await lookupCustomer(admin, profileId);
  if (!found.ok) return { ok: false, error: found.unavailable ? UNAVAILABLE : FAILED };
  if (!found.customerId) return notFound;

  try {
    const method = await stripe.paymentMethods.retrieve(paymentMethodId);
    const owner = typeof method.customer === "string" ? method.customer : method.customer?.id;
    return owner === found.customerId ? { ok: true, customerId: found.customerId } : notFound;
  } catch (err) {
    if (isMissingResource(err)) return notFound;
    throw err;
  }
}

export async function removeSavedCard(
  profileId: string,
  paymentMethodId: string,
): Promise<CardsResult<{ cards: SavedCard[] }>> {
  const stripe = await stripeClient();
  if (!stripe) return { ok: false, error: "Payments aren't configured. Please try again shortly." };
  const admin = createAdminClient();
  try {
    const own = await ownCard(stripe, admin, profileId, paymentMethodId);
    if (!own.ok) return own;
    await stripe.paymentMethods.detach(paymentMethodId);
    return { ok: true, cards: await cardsOf(stripe, admin, own.customerId) };
  } catch (err) {
    console.error("[saved cards] remove failed", profileId, err);
    return { ok: false, error: "We couldn't remove that card just now. Please try again." };
  }
}

export async function setDefaultCard(
  profileId: string,
  paymentMethodId: string,
): Promise<CardsResult<{ cards: SavedCard[] }>> {
  const stripe = await stripeClient();
  if (!stripe) return { ok: false, error: "Payments aren't configured. Please try again shortly." };
  const admin = createAdminClient();
  try {
    const own = await ownCard(stripe, admin, profileId, paymentMethodId);
    if (!own.ok) return own;
    await stripe.customers.update(own.customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
    return { ok: true, cards: await cardsOf(stripe, admin, own.customerId) };
  } catch (err) {
    console.error("[saved cards] set default failed", profileId, err);
    return { ok: false, error: "We couldn't change your default card just now. Please try again." };
  }
}

async function customerSessionSecret(
  stripe: StripeClient,
  customerId: string,
  surface: CardSurface,
): Promise<string | null> {
  // Show the saved cards; don't offer to save, or to remove them, from inside
  // a payment form. Payment methods is where cards are managed.
  const features = {
    payment_method_redisplay: "enabled",
    payment_method_allow_redisplay_filters: ["always", "limited", "unspecified"],
    payment_method_remove: "disabled",
    payment_method_save: "disabled",
  } as const;
  try {
    const session = await stripe.customerSessions.create({
      customer: customerId,
      components:
        surface === "web"
          ? { payment_element: { enabled: true, features: { ...features, payment_method_redisplay: "enabled", payment_method_allow_redisplay_filters: [...features.payment_method_allow_redisplay_filters] } } }
          : { mobile_payment_element: { enabled: true, features: { ...features, payment_method_allow_redisplay_filters: [...features.payment_method_allow_redisplay_filters] } } },
    });
    return session.client_secret;
  } catch (err) {
    // Not fatal: the form still takes a card, it just won't list the saved ones.
    console.error("[saved cards] customer session failed", customerId, err);
    return null;
  }
}

/**
 * For checkout: the Customer to make the hold against and a session that lists
 * their saved cards. Null when they have no saved card, in which case the hold
 * is made exactly as before, with no Customer (owner decision 2026-09-15).
 */
export async function checkoutCustomerFor(
  profileId: string,
  surface: CardSurface,
): Promise<{ customerId: string; customerSessionClientSecret: string | null } | null> {
  const admin = createAdminClient();
  const found = await lookupCustomer(admin, profileId);
  if (!found.ok || !found.customerId) return null;

  const stripe = await stripeClient();
  if (!stripe) return null;
  try {
    const methods = await stripe.customers.listPaymentMethods(found.customerId, { type: "card", limit: 1 });
    if (methods.data.length === 0) return null;
    return {
      customerId: found.customerId,
      customerSessionClientSecret: await customerSessionSecret(stripe, found.customerId, surface),
    };
  } catch (err) {
    // A checkout must never fail because saved cards couldn't be read.
    console.error("[saved cards] checkout lookup failed", profileId, err);
    return null;
  }
}

/**
 * Account deletion: delete the caller's Stripe Customer, which removes every
 * saved card, then forget it. A failure keeps the row and logs the id so it can
 * be retried by hand; it never blocks the deletion.
 */
export async function deleteSavedCardsFor(profileId: string): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("stripe_customers")
    .select("stripe_customer_id, livemode")
    .eq("profile_id", profileId);
  if (error) {
    if (!isMissingTable(error)) console.error("[saved cards] deletion lookup failed", profileId, error.message);
    return;
  }
  const rows = (data ?? []) as Array<{ stripe_customer_id: string; livemode: boolean }>;
  if (rows.length === 0) return;

  const stripe = await stripeClient();
  const mode = livemode();
  for (const row of rows) {
    if (!stripe || row.livemode !== mode) {
      console.error(
        "[saved cards] Stripe Customer left to delete by hand",
        profileId,
        row.stripe_customer_id,
        row.livemode ? "live" : "test",
      );
      continue;
    }
    try {
      await stripe.customers.del(row.stripe_customer_id);
    } catch (err) {
      if (!isMissingResource(err)) {
        console.error("[saved cards] Stripe Customer delete failed", profileId, row.stripe_customer_id, err);
        continue;
      }
    }
    await admin.from("stripe_customers").delete().eq("stripe_customer_id", row.stripe_customer_id);
  }
}
