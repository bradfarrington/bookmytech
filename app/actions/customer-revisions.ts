"use server";

import { createClient } from "@/lib/supabase/server";
import type { BookingCaller } from "@/lib/bookings/ownership";
import { confirmRevisionPaymentFor, respondToRevisionFor } from "@/lib/revisions/customer";

// The WEBSITE's entry points into the customer revision core (Task 37).
// Signed-in only — approving a dearer job authorises money on a card, and
// the hold's ownership is proved through the intent's `customer_id`
// metadata. The caller is read from the verified session, never taken as an
// argument.

async function cookieCaller(): Promise<BookingCaller | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { userId: user.id, email: user.email ?? null } : null;
}

export async function approveRevision(revisionId: string) {
  const caller = await cookieCaller();
  if (!caller) return { ok: false as const, error: "Please sign in." };
  return respondToRevisionFor(revisionId, "approve", caller);
}

export async function declineRevision(revisionId: string) {
  const caller = await cookieCaller();
  if (!caller) return { ok: false as const, error: "Please sign in." };
  return respondToRevisionFor(revisionId, "decline", caller);
}

export async function confirmRevisionPayment(revisionId: string, paymentIntentId: string) {
  const caller = await cookieCaller();
  if (!caller) return { ok: false as const, error: "Please sign in." };
  return confirmRevisionPaymentFor(revisionId, paymentIntentId, caller);
}
