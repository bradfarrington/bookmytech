"use server";

import { createClient } from "@/lib/supabase/server";
import type { BookingCaller } from "@/lib/bookings/ownership";
import { confirmQuotePaymentFor, respondToQuoteFor } from "@/lib/quotes/customer";

// The WEBSITE's entry points into the customer quote core (Task 33). Signed-in
// only — approving a quote authorises money on a card, and the hold's
// ownership is proved through the intent's `customer_id` metadata, which a
// possession-only guest link couldn't supply. The caller is read from the
// verified session, never taken as an argument.

async function cookieCaller(): Promise<BookingCaller | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { userId: user.id, email: user.email ?? null } : null;
}

export async function approveQuote(quoteId: string) {
  const caller = await cookieCaller();
  if (!caller) return { ok: false as const, error: "Please sign in." };
  return respondToQuoteFor(quoteId, "approve", caller);
}

export async function declineQuote(quoteId: string) {
  const caller = await cookieCaller();
  if (!caller) return { ok: false as const, error: "Please sign in." };
  return respondToQuoteFor(quoteId, "decline", caller);
}

export async function confirmQuotePayment(quoteId: string, paymentIntentId: string) {
  const caller = await cookieCaller();
  if (!caller) return { ok: false as const, error: "Please sign in." };
  return confirmQuotePaymentFor(quoteId, paymentIntentId, caller);
}
