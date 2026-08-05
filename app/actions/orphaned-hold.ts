"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { trackEvent } from "@/app/actions/track-event";
import { formatPrice } from "@/lib/utils";

// "We took the hold but never wrote the booking" — the one failure the checkout
// can't fix by itself.
//
// It exists because the web funnel can now be interrupted by a 3-D Secure
// redirect (see the return path in app/(customer)/book/slot/_components/
// slot-picker.tsx). Ordering is unchanged — hold first, then write the row — so
// a payment failure still leaves no orphaned booking row. This is the other
// direction: a live, uncaptured hold on a real customer's card with nothing in
// the CRM to capture it against. It expires on its own after 7 days, but nobody
// would ever know it happened, and the customer is left thinking they've booked.
//
// This is called from the browser, so it is a public endpoint like every other
// "use server" export. It takes no money, writes no booking, and returns
// nothing — the only thing an attacker could do with it is send noise to the
// ops inbox. Two things stop that, and BOTH are needed:
//
//   1. The status is re-read from Stripe rather than trusted from the caller,
//      so a made-up intent id gets nowhere: you'd need one that genuinely
//      exists on our account and is genuinely holding funds.
//   2. It alerts at most ONCE per intent id. Gate 1 alone doesn't help against
//      a REAL orphan — that passes every check on every call by definition — so
//      a loop with one valid id would email on each hit.

const ALERT_EMAIL = process.env.ADMIN_ALERT_EMAIL || "help@bookmytech.co.uk";

/** Doubles as the "we've already alerted on this intent" record — see below. */
const ORPHAN_EVENT = "orphaned_hold";

/** Why the booking never got written — free text, ops-facing only. */
export async function reportOrphanedHold(
  paymentIntentId: string,
  reason: string,
): Promise<void> {
  try {
    if (!/^pi_[A-Za-z0-9_]{4,}$/.test(paymentIntentId)) return;

    let stripe;
    try {
      stripe = (await import("@/lib/stripe/server")).stripe;
    } catch {
      console.error("Orphaned hold reported but Stripe isn't configured", paymentIntentId);
      return;
    }

    // Expand the payment method: the billing details carried on it are the only
    // thing on a bare intent that identifies who to ring back.
    const intent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ["payment_method"],
    });

    // Only funds that are actually committed are worth waking anyone for. A
    // requires_payment_method / canceled intent holds nothing, so a report
    // against one is either a mistake or noise — drop it silently.
    if (intent.status !== "requires_capture" && intent.status !== "succeeded") return;

    // Already reconciled (the customer retried and a row exists, or someone
    // wrote it by hand) — nothing is orphaned.
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("bookings")
      .select("id")
      .eq("stripe_payment_intent_id", paymentIntentId)
      .maybeSingle();
    if (existing) return;

    // ONE ALERT PER INTENT. The Stripe status check above only stops made-up
    // intent ids; a GENUINE orphan passes every gate above on every call, so
    // without this a loop against one real id would send an email each time.
    // The `orphaned_hold` event we write below is the record of having alerted
    // — funnel_events.event_name is free-form, so this needs no migration, and
    // the (event_name, occurred_at) index keeps the lookup cheap.
    const { data: alerted } = await admin
      .from("funnel_events")
      .select("id")
      .eq("event_name", ORPHAN_EVENT)
      .eq("properties->>paymentIntentId", paymentIntentId)
      .limit(1);
    if (alerted && alerted.length > 0) return;

    const amount = formatPrice(intent.amount);
    const billing =
      intent.payment_method && typeof intent.payment_method !== "string"
        ? intent.payment_method.billing_details
        : null;
    const who = [billing?.name, billing?.email].filter(Boolean).join(" · ") || "unknown";

    console.error(
      `ORPHANED HOLD ${paymentIntentId} — ${amount} ${intent.status}, no booking row. Reason: ${reason}`,
    );

    // Awaited, and BEFORE the email: it's the dedupe record, so a send that
    // races another call must not be the thing that establishes it. Two
    // genuinely simultaneous calls can still both get through — closing that
    // would need a unique index, and the case this guards is a loop, not a tie.
    await trackEvent(ORPHAN_EVENT, {
      paymentIntentId,
      status: intent.status,
      amountPence: intent.amount,
      reason,
    });

    await sendEmail({
      to: ALERT_EMAIL,
      subject: `Orphaned Stripe hold — ${amount} with no booking (${paymentIntentId})`,
      html: `
        <p><strong>A pre-authorisation succeeded but no booking row was written.</strong></p>
        <p>The customer has been told we're holding the funds and asked to contact us.</p>
        <ul>
          <li>PaymentIntent: <code>${paymentIntentId}</code></li>
          <li>Status: <code>${intent.status}</code></li>
          <li>Amount: ${amount}</li>
          <li>Card billing details: ${who}</li>
          <li>Reason: ${reason}</li>
        </ul>
        <p>Either book the job manually against this intent id, or cancel the hold in
        Stripe and tell the customer. Left alone it releases itself after 7 days.</p>
      `,
    });
  } catch (err) {
    // Reporting a failure must never itself become a failure the customer sees.
    console.error("reportOrphanedHold failed", paymentIntentId, err);
  }
}
