import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { loadQuote, QUOTE_COLUMNS } from "./load";
import { notifyMechanicQuoteOutcome, type QuoteBookingContact } from "./notify";

// Lapse quotes the customer never answered (Task 33). Run hourly by
// /api/cron/expire-quotes. A hold the customer started but didn't finish is
// released; the mechanic is told so they can re-send.

export async function expireStaleQuotes(): Promise<{ expired: number }> {
  const admin = createAdminClient();
  const { data: stale } = await admin
    .from("job_quotes")
    .select(QUOTE_COLUMNS)
    .eq("status", "sent")
    .lt("expires_at", new Date().toISOString())
    .limit(200);
  let expired = 0;
  for (const row of stale ?? []) {
    const { error } = await admin
      .from("job_quotes")
      .update({ status: "expired", responded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "sent");
    if (error) continue;
    expired += 1;
    if (row.stripe_payment_intent_id) {
      try {
        const { stripe } = await import("@/lib/stripe/server");
        const intent = await stripe.paymentIntents.retrieve(row.stripe_payment_intent_id);
        if (intent.status !== "canceled" && intent.status !== "succeeded") await stripe.paymentIntents.cancel(intent.id);
      } catch {
        // No keys, or already gone.
      }
    }
    await admin.from("booking_faults").update({ quote_id: null }).eq("quote_id", row.id);
    await admin.from("booking_events").insert({
      booking_id: row.booking_id,
      event_type: "quote_expired",
      actor_role: "system",
      payload: { quote_id: row.id, total_pence: row.total_pence },
    });
    const [{ data: booking }, quote] = await Promise.all([
      admin
        .from("bookings")
        .select("id, job_number, customer_id, customer_email, customer_name, customer_phone, mechanic_id")
        .eq("id", row.booking_id)
        .maybeSingle(),
      loadQuote(admin, row.id),
    ]);
    if (booking && quote) void notifyMechanicQuoteOutcome(booking as QuoteBookingContact, quote, "expired");
  }
  return { expired };
}
