import "server-only";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ownsBooking, type BookingCaller } from "@/lib/bookings/ownership";
import { formatJobNumber } from "@/lib/utils";
import { loadQuote, loadQuotesForBooking, type QuoteView } from "./load";
import { respondRefusal } from "./status";
import { notifyMechanicQuoteOutcome, type QuoteBookingContact } from "./notify";

// The customer's side of a quote (Task 33): see it, decline it, or approve it
// — which for extra work on this visit means authorising a SECOND hold on
// their card (the original manual-capture hold can't be increased), captured
// with the base hold when the job completes.
//
// Shared by the website (app/actions/customer-quotes.ts, cookie session) and
// the mobile app (app/api/mobile/v1/bookings/[id]/quotes/**, Bearer token).
// The caller is a parameter, decided by the trusted layer — the same rule as
// lib/bookings/manage-booking.ts, for the same reasons.

export type QuoteRespondResult =
  | { ok: true; outcome: "declined" }
  /** Extra work on this visit: authorise this intent, then call confirmQuotePaymentFor. */
  | { ok: true; outcome: "pay"; clientSecret: string; paymentIntentId: string; amountPence: number }
  /** A return visit: nothing to pay now — book it (Task 34). */
  | { ok: true; outcome: "book"; quoteId: string }
  /** Already approved — nothing more to do. */
  | { ok: true; outcome: "approved" }
  | { ok: false; error: string };

export type QuoteConfirmResult = { ok: true } | { ok: false; error: string };

const BOOKING_COLUMNS =
  "id, job_number, status, customer_id, customer_email, customer_name, customer_phone, mechanic_id, total_pence, base_price_pence, parts_price_pence, platform_fee_pence, mechanic_payout_pence";

type QuoteBooking = QuoteBookingContact & {
  status: string;
  total_pence: number | null;
  base_price_pence: number | null;
  parts_price_pence: number | null;
  platform_fee_pence: number | null;
  mechanic_payout_pence: number | null;
};

async function loadOwned(quoteId: string, caller: BookingCaller) {
  const admin = createAdminClient();
  const quote = await loadQuote(admin, quoteId);
  if (!quote) return { ok: false as const, error: "That quote no longer exists." };
  const { data } = await admin.from("bookings").select(BOOKING_COLUMNS).eq("id", quote.bookingId).single();
  const booking = data as QuoteBooking | null;
  if (!booking) return { ok: false as const, error: "That booking no longer exists." };
  if (!ownsBooking(booking, caller)) return { ok: false as const, error: "This isn't your booking." };
  return { ok: true as const, quote, booking, admin };
}

function revalidate(bookingId: string) {
  revalidatePath("/dashboard");
  revalidatePath(`/book/confirmed/${bookingId}`);
  revalidatePath(`/mechanic/jobs/${bookingId}`);
  revalidatePath(`/admin/jobs/${bookingId}`);
}

/** Every quote on a booking the caller owns. */
export async function listQuotesFor(
  bookingId: string,
  caller: BookingCaller,
): Promise<{ ok: true; quotes: QuoteView[] } | { ok: false; error: string }> {
  const admin = createAdminClient();
  const { data: booking } = await admin.from("bookings").select("customer_id, customer_email").eq("id", bookingId).maybeSingle();
  if (!booking) return { ok: false, error: "That booking no longer exists." };
  if (!ownsBooking(booking, caller)) return { ok: false, error: "This isn't your booking." };
  return { ok: true, quotes: await loadQuotesForBooking(admin, bookingId) };
}

/** One quote the caller owns, with its booking summary. */
export async function getQuoteFor(quoteId: string, caller: BookingCaller) {
  const owned = await loadOwned(quoteId, caller);
  if (!owned.ok) return owned;
  return { ok: true as const, quote: owned.quote, booking: owned.booking };
}

export async function respondToQuoteFor(
  quoteId: string,
  decision: "approve" | "decline",
  caller: BookingCaller,
): Promise<QuoteRespondResult> {
  const owned = await loadOwned(quoteId, caller);
  if (!owned.ok) return owned;
  const { quote, booking, admin } = owned;

  if (quote.status === "approved") return { ok: true, outcome: "approved" };
  const refusal = respondRefusal(quote, booking.status);
  if (refusal) return { ok: false, error: refusal };

  if (decision === "decline") {
    if (quote.stripePaymentIntentId) await cancelIntentQuietly(quote.stripePaymentIntentId);
    const { error } = await admin
      .from("job_quotes")
      .update({ status: "declined", responded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", quoteId)
      .eq("status", "sent");
    if (error) return { ok: false, error: error.message };
    await admin.from("booking_events").insert({
      booking_id: booking.id,
      event_type: "quote_declined",
      actor_id: caller.userId,
      actor_role: "customer",
      payload: { quote_id: quoteId, total_pence: quote.totalPence },
    });
    void notifyMechanicQuoteOutcome(booking, quote, "declined");
    revalidate(booking.id);
    return { ok: true, outcome: "declined" };
  }

  if (quote.kind === "follow_on") return { ok: true, outcome: "book", quoteId };

  // Extra work on this visit: a second manual-capture hold for the quote's
  // total. Reused if the customer started one and didn't finish; created
  // otherwise. Nothing on the quote changes until the card is authorised.
  let stripe;
  try {
    stripe = (await import("@/lib/stripe/server")).stripe;
  } catch {
    return { ok: false, error: "Payments aren't available right now. Please try again shortly." };
  }
  try {
    if (quote.stripePaymentIntentId) {
      const existing = await stripe.paymentIntents.retrieve(quote.stripePaymentIntentId);
      if (
        (existing.status === "requires_payment_method" || existing.status === "requires_confirmation" || existing.status === "requires_action" || existing.status === "requires_capture") &&
        existing.amount === quote.totalPence &&
        existing.client_secret
      ) {
        return {
          ok: true,
          outcome: "pay",
          clientSecret: existing.client_secret,
          paymentIntentId: existing.id,
          amountPence: quote.totalPence,
        };
      }
    }
    const intent = await stripe.paymentIntents.create({
      amount: quote.totalPence,
      currency: "gbp",
      capture_method: "manual",
      payment_method_types: ["card"],
      description: `Book My Tech — additional work on job ${formatJobNumber(booking.job_number)}`,
      metadata: { customer_id: caller.userId, booking_id: booking.id, quote_id: quoteId },
    });
    if (!intent.client_secret) return { ok: false, error: "Couldn't start the payment. Please try again." };
    await admin
      .from("job_quotes")
      .update({ stripe_payment_intent_id: intent.id, updated_at: new Date().toISOString() })
      .eq("id", quoteId);
    return { ok: true, outcome: "pay", clientSecret: intent.client_secret, paymentIntentId: intent.id, amountPence: quote.totalPence };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Payment error" };
  }
}

/**
 * The card has been authorised for the quote — prove it against Stripe, then
 * approve the quote and add its figures to the booking. Idempotent: a repeat
 * with the same intent on an approved quote is a success.
 */
export async function confirmQuotePaymentFor(
  quoteId: string,
  paymentIntentId: string,
  caller: BookingCaller,
): Promise<QuoteConfirmResult> {
  const owned = await loadOwned(quoteId, caller);
  if (!owned.ok) return owned;
  const { quote, booking, admin } = owned;
  if (quote.status === "approved" && quote.stripePaymentIntentId === paymentIntentId) return { ok: true };
  if (quote.kind !== "now") return { ok: false, error: "This quote doesn't take a payment." };
  const refusal = respondRefusal(quote, booking.status);
  if (refusal) return { ok: false, error: refusal };
  if (!/^pi_[A-Za-z0-9_]{4,}$/.test(paymentIntentId)) return { ok: false, error: "We couldn't find that payment." };

  let stripe;
  try {
    stripe = (await import("@/lib/stripe/server")).stripe;
  } catch {
    return { ok: false, error: "Payments aren't available right now. Please try again shortly." };
  }
  let intent;
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch {
    return { ok: false, error: "We couldn't find that payment." };
  }
  if (intent.metadata?.quote_id !== quoteId || intent.metadata?.customer_id !== caller.userId)
    return { ok: false, error: "We couldn't find that payment." };
  if (intent.status !== "requires_capture")
    return { ok: false, error: "Your card hasn't been authorised yet — please try the payment again." };
  if (intent.amount !== quote.totalPence)
    return { ok: false, error: "That payment doesn't match the quote. Please try again." };

  const now = new Date().toISOString();
  const { error } = await admin
    .from("job_quotes")
    .update({ status: "approved", stripe_payment_intent_id: intent.id, responded_at: now, updated_at: now })
    .eq("id", quoteId)
    .eq("status", "sent");
  if (error) return { ok: false, error: error.message };

  // The booking's own figures grow by the quote's — the app shows total_pence
  // as "what you pay", and after this that is the true figure.
  const totalAfter = (booking.total_pence ?? 0) + quote.totalPence;
  await admin
    .from("bookings")
    .update({
      total_pence: totalAfter,
      base_price_pence: (booking.base_price_pence ?? 0) + quote.labourPence,
      parts_price_pence: (booking.parts_price_pence ?? 0) + quote.partsPence,
      platform_fee_pence: (booking.platform_fee_pence ?? 0) + quote.platformFeePence,
      mechanic_payout_pence: (booking.mechanic_payout_pence ?? 0) + quote.mechanicPayoutPence,
    })
    .eq("id", booking.id);

  await admin.from("booking_events").insert({
    booking_id: booking.id,
    event_type: "quote_approved",
    actor_id: caller.userId,
    actor_role: "customer",
    payload: {
      quote_id: quoteId,
      amount_pence: quote.totalPence,
      total_before: booking.total_pence,
      total_after: totalAfter,
      payment_intent_id: intent.id,
    },
  });
  void notifyMechanicQuoteOutcome(booking, quote, "approved");
  revalidate(booking.id);
  return { ok: true };
}

async function cancelIntentQuietly(paymentIntentId: string): Promise<void> {
  try {
    const { stripe } = await import("@/lib/stripe/server");
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== "canceled" && intent.status !== "succeeded") await stripe.paymentIntents.cancel(paymentIntentId);
  } catch {
    // Nothing to release.
  }
}
