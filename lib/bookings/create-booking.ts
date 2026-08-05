import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { sendSms } from "@/lib/sms/send-sms";
import { renderSmsTemplate } from "@/lib/sms/render-template";
import { formatPrice, formatJobNumber } from "@/lib/utils";
import { dispatchBooking } from "@/lib/dispatch/dispatch";
import { quoteRepair } from "@/lib/haynespro/repair-booking";
import { trackEvent } from "@/app/actions/track-event";
import { FUNNEL_EVENTS } from "@/lib/analytics/events";
import { availableCreditPence, redeemCreditForBooking } from "@/lib/credits/credits";

// The one implementation of "price this booking" and "write this booking".
//
// It lives in lib/ rather than app/actions/ because it has TWO callers with two
// different ways of knowing who is booking:
//
//   • the website — app/actions/create-booking.ts, a thin "use server" wrapper
//     that resolves the customer from the session COOKIE;
//   • the mobile app — app/api/mobile/v1/checkout/prepare and .../bookings,
//     which resolve the customer from a verified `Authorization: Bearer` token.
//
// So the customer id is a PARAMETER here, never something this module derives.
// That split is deliberate and load-bearing in both directions:
//
//   1. A mobile request carries no cookies. If this code reached for the cookie
//      client (lib/supabase/server.ts) it would get a null session — silently,
//      with no error — and write a GUEST booking: customer_id null, so the job
//      never appears in the customer's account, and account credit and
//      preferred-mechanic handling are skipped. It would pass a smoke test.
//      See lib/supabase/mobile.ts and docs/tasks/18-mobile-api.md.
//
//   2. `customerId` must NOT become an argument of the Server Actions. Every
//      export of a "use server" file is a public endpoint the browser can call
//      with arguments of its choosing, so a `customerId` parameter there would
//      let anyone attach a booking to anyone else's account. The wrapper takes
//      no such argument; it reads the caller from the verified session itself.
//
// Nothing here is duplicated per client: both clients price, charge and write
// through these two functions, so they cannot quote or bill differently.

// The pre-auth hold is ALWAYS taken at booking (owner decision 2026-06-05).
// 'free' is only the credit-covers-the-whole-total edge — nothing to authorise.
export type PaymentMode = "preauth" | "free";

export interface CreateBookingInput {
  vehicleReg: string;
  vehicleMake: string;
  vehicleModel?: string;
  /** HaynesPro repair node id — what's being booked. The server re-quotes it
   *  from (reg, nodeId); nothing is priced client-side. */
  repairNodeId: string;
  scheduledAt: string; // ISO string — the window start
  /** Human arrival window the customer picked ("8am–10am" … "All day (8am–8pm)"). */
  slotWindow?: string;
  customerEmail: string;
  customerName: string;
  /** Optional — lets guests receive booking SMS updates (signed-in users use their profile phone). */
  customerPhone?: string;
  addressLine1: string;
  addressLine2?: string;
  postcode: string;
  parkingType: string;
  specialInstructions?: string;
  /** Present for preauth bookings (the manual-capture pre-auth hold). */
  stripePaymentIntentId?: string;
  /** Rebook "same mechanic if available" — dispatch offers this mechanic first. */
  preferredMechanicId?: string;
  // --- Stage 3: credit + payment mode (server-decided in prepareCheckout) -----
  paymentMode?: PaymentMode;
  /** Credit the held amount was reduced by at prepare time (clamped on redeem). */
  creditAppliedPence?: number;
}

/**
 * Write the booking, dispatch it and notify the customer.
 *
 * `customerId` is the authenticated caller, resolved by the caller of this
 * function — cookie session on the website, Bearer token on mobile. Null is a
 * guest booking. It is never read from `input`, which is client-supplied.
 */
export async function createBooking(
  input: CreateBookingInput,
  customerId: string | null,
): Promise<{ ok: true; bookingId: string } | { ok: false; error: string }> {
  // Snapshot a phone onto the booking so SMS touchpoints (on the way, complete,
  // cancel, message nudges) can reach the customer. Signed-in customers use
  // their profile phone; the funnel also collects an optional number (the only
  // source for guests), used as a fallback when the profile has none.
  const inputPhone = input.customerPhone?.trim() || null;
  let customerPhone: string | null = inputPhone;
  if (customerId) {
    const { data: prof } = await createAdminClient()
      .from("profiles")
      .select("phone")
      .eq("id", customerId)
      .maybeSingle();
    customerPhone = prof?.phone ?? inputPhone;
  }

  // Account credit (and the 'free' mode it can unlock) only applies to signed-in
  // customers. Defensively collapse anything else to the plain pre-auth path a
  // guest takes.
  const mode: PaymentMode = customerId ? (input.paymentMode ?? "preauth") : "preauth";
  const passedCredit = customerId ? Math.max(0, Math.round(input.creditAppliedPence ?? 0)) : 0;

  // Recompute the canonical price server-side — never trust a client-supplied
  // total. The same (reg, repair node) inputs produced the prepare amount
  // moments earlier. The full breakdown is snapshotted onto the row so later
  // pricing changes never apply retroactively.
  const quote = await quoteRepair(
    input.vehicleReg,
    input.repairNodeId,
    createAdminClient(),
  );
  if (!quote) {
    return {
      ok: false,
      error: "We couldn't price this repair. Please start the booking again.",
    };
  }
  const price = quote.breakdown;
  const repairDescription = quote.description;

  // Write the booking through the service-role client (the codebase convention —
  // see 0023: "all writes go through the service-role client in the server").
  // Safe here: the price is recomputed server-side above and customer_id is the
  // verified caller, never a value from the request — nothing is client-trusted.
  // This also makes the insert independent of any RLS-policy drift on the live
  // `bookings` table (the anon client was throwing "new row violates row-level
  // security policy").
  const db = createAdminClient();
  const { data, error } = await db
    .from("bookings")
    .insert({
      customer_id: customerId,
      repair_node_id: input.repairNodeId,
      repair_description: repairDescription,
      vehicle_reg: input.vehicleReg,
      vehicle_make: input.vehicleMake,
      vehicle_model: input.vehicleModel ?? null,
      scheduled_at: input.scheduledAt,
      slot_window: input.slotWindow ?? null,
      status: "sourcing_mechanic",
      total_pence: price.totalPence,
      area_id: price.areaId,
      base_price_pence: price.basePence,
      service_duration_hours: price.durationHours,
      duration_source: price.durationSource ?? null,
      vehicle_raw_duration_hours: price.vehicleRawDurationHours ?? null,
      hourly_rate_pence: price.hourlyRatePence,
      parts_price_pence: price.partsPence,
      commission_rate: price.commissionRate,
      platform_fee_pence: price.platformFeePence,
      mechanic_payout_pence: price.mechanicPayoutPence,
      stripe_payment_intent_id: input.stripePaymentIntentId ?? null,
      customer_email: input.customerEmail,
      customer_name: input.customerName,
      customer_phone: customerPhone,
      address_line_1: input.addressLine1,
      address_line_2: input.addressLine2 ?? null,
      parking_type: input.parkingType,
      special_instructions: input.specialInstructions ?? null,
      postcode: input.postcode,
      preferred_mechanic_id: input.preferredMechanicId ?? null,
      payment_mode: mode,
    })
    .select("id, job_number")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to create booking" };
  }

  // Redeem the customer's account credit against this booking (service-role —
  // customer_credits has no browser write policy). Clamp to what the charge was
  // actually reduced by so the ledger can't diverge from what Stripe took, and
  // record the redeemed amount on the booking.
  if (customerId && passedCredit > 0) {
    const admin = createAdminClient();
    const redeemed = await redeemCreditForBooking(admin, customerId, data.id, passedCredit);
    if (redeemed > 0) {
      await admin.from("bookings").update({ credit_applied_pence: redeemed }).eq("id", data.id);
    }
  }

  // Record the final funnel step (server-side so it's never lost to navigation).
  void trackEvent(FUNNEL_EVENTS.bookingConfirmed, {
    bookingId: data.id,
    repairNodeId: input.repairNodeId,
    totalPence: price.totalPence,
  });

  // Broadcast the job to every eligible online mechanic (first-to-accept wins).
  try {
    await dispatchBooking(data.id);
  } catch (err) {
    console.error("Dispatch failed for booking", data.id, err);
  }

  // Fire and forget — don't block the redirect on email.
  const chargedPence = Math.max(0, price.totalPence - passedCredit);
  const payLine =
    mode === "free"
      ? `Covered in full by your account credit (${formatPrice(price.totalPence)}). Nothing to pay.`
      : `Amount pre-authorised${passedCredit > 0 ? ` (after ${formatPrice(passedCredit)} credit)` : ""}: ${formatPrice(chargedPence)}`;
  const whenLabel = `${new Date(input.scheduledAt).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })}${
    input.slotWindow
      ? ` · ${input.slotWindow}`
      : `, ${new Date(input.scheduledAt).toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit" })}`
  }`;
  const vehicleLabel = `${input.vehicleReg ? `${input.vehicleReg} — ` : ""}${input.vehicleMake}${
    input.vehicleModel ? ` ${input.vehicleModel}` : ""
  }`;
  renderTemplateEmail("booking_confirmed", {
    name: input.customerName,
    ref: formatJobNumber(data.job_number),
    service: repairDescription,
    vehicle: vehicleLabel,
    when: whenLabel,
    pay_line: payLine,
  })
    .then(({ subject, html }) => sendEmail({ to: input.customerEmail, subject, html }))
    .catch(console.error);

  if (customerPhone) {
    const body = await renderSmsTemplate("booking_received", {
      ref: formatJobNumber(data.job_number),
    });
    sendSms({ to: customerPhone, body }).catch(() => {});
  }

  return { ok: true, bookingId: data.id };
}

export interface PrepareCheckoutInput {
  postcode: string;
  /** Booking vehicle reg — the hold must match the amount createBooking
   *  re-quotes from the same (reg, node) moments later. */
  vehicleReg: string;
  /** HaynesPro repair node id — what's being booked. */
  repairNodeId: string;
}

export type PrepareCheckoutResult =
  | {
      ok: true;
      mode: "preauth";
      clientSecret: string;
      totalPence: number;
      creditAppliedPence: number;
      chargePence: number;
    }
  | { ok: true; mode: "free"; totalPence: number; creditAppliedPence: number; chargePence: 0 }
  | { ok: false; error: string };

/**
 * Price the booking, apply any account credit, and set up payment (Stage 3).
 * Server-authoritative — the client never sets the amount, the credit, or the mode.
 *
 * `customerId` is the authenticated caller (null for a guest), resolved by the
 * caller of this function — see the note at the top of this file.
 *
 * The pre-authorisation hold is ALWAYS taken at booking (owner decision
 * 2026-06-05) — trusted/loyalty status never skips it:
 *   • 'preauth' (default) → a manual-capture PaymentIntent for (total − credit)
 *     is held now and captured on completion. Guests have no credit, so this is
 *     the unchanged guest path.
 *   • 'free' → the only no-card case: account credit covers the whole total, so
 *     there is genuinely nothing to authorise.
 */
export async function prepareCheckoutFor(
  input: PrepareCheckoutInput,
  customerId: string | null,
): Promise<PrepareCheckoutResult> {
  const quote = await quoteRepair(
    input.vehicleReg,
    input.repairNodeId,
    createAdminClient(),
  );
  if (!quote) {
    return {
      ok: false,
      error: "We couldn't price this repair. Please start the booking again.",
    };
  }
  const totalPence = quote.breakdown.totalPence;

  // Account credit (signed-in only) reduces the amount held — never the payout.
  let creditApplied = 0;
  if (customerId) {
    const admin = createAdminClient();
    creditApplied = Math.min(await availableCreditPence(admin, customerId), totalPence);
  }
  const chargePence = Math.max(0, totalPence - creditApplied);

  // Fully credit-covered → nothing to authorise, no card needed.
  if (chargePence === 0) {
    return { ok: true, mode: "free", totalPence, creditAppliedPence: creditApplied, chargePence: 0 };
  }

  // Lazy Stripe import — friendly error if keys aren't configured.
  let stripe;
  try {
    stripe = (await import("@/lib/stripe/server")).stripe;
  } catch {
    return { ok: false, error: "Payments aren't configured. Please try again shortly." };
  }

  try {
    const intent = await stripe.paymentIntents.create({
      amount: chargePence,
      currency: "gbp",
      capture_method: "manual",
      // Pinned to cards deliberately. Left unset, the intent offers whatever the
      // Stripe dashboard has enabled, which can include redirect-only methods —
      // and a redirect-only method has no business on a manual-capture hold that
      // is captured days later. Both funnels collect a card and nothing else:
      // the website's PaymentElement and the app's PaymentSheet.
      payment_method_types: ["card"],
      description: "Book My Tech — repair pre-authorisation",
      // Who this hold belongs to, so it can be proved later. Nothing reads it
      // during checkout — it exists for lib/stripe/release-hold.ts, which
      // cancels a hold the customer abandoned and must confirm the intent is
      // theirs before touching it. The intent id alone can't prove that: it
      // arrives in the request body, so anyone holding someone else's id could
      // release their funds. Absent for guests (no id to record), which is why
      // releasing is an authenticated-only action.
      ...(customerId ? { metadata: { customer_id: customerId } } : {}),
    });
    if (!intent.client_secret) return { ok: false, error: "Couldn't start the payment. Please try again." };
    return {
      ok: true,
      mode: "preauth",
      clientSecret: intent.client_secret,
      totalPence,
      creditAppliedPence: creditApplied,
      chargePence,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Payment error" };
  }
}
