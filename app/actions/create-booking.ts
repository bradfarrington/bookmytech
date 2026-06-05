"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { formatPrice } from "@/lib/utils";
import { dispatchBooking } from "@/lib/dispatch/dispatch";
import { calculatePrice } from "@/lib/pricing/calculate";
import { trackEvent } from "@/app/actions/track-event";
import { FUNNEL_EVENTS } from "@/lib/analytics/events";
import { availableCreditPence, redeemCreditForBooking } from "@/lib/credits/credits";

// The pre-auth hold is ALWAYS taken at booking (owner decision 2026-06-05).
// 'free' is only the credit-covers-the-whole-total edge — nothing to authorise.
export type PaymentMode = "preauth" | "free";

export interface CreateBookingInput {
  vehicleReg: string;
  vehicleMake: string;
  vehicleModel?: string;
  serviceName: string;
  serviceId: string;
  scheduledAt: string; // ISO string
  customerEmail: string;
  customerName: string;
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

export async function createBookingAction(
  input: CreateBookingInput,
): Promise<{ ok: true; bookingId: string } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data: session } = await supabase.auth.getSession();
  const customerId = session?.session?.user?.id ?? null;

  // Account credit (and the 'free' mode it can unlock) only applies to signed-in
  // customers. Defensively collapse anything else to the plain pre-auth path a
  // guest takes.
  const mode: PaymentMode = customerId ? (input.paymentMode ?? "preauth") : "preauth";
  const passedCredit = customerId ? Math.max(0, Math.round(input.creditAppliedPence ?? 0)) : 0;

  // Recompute the canonical price server-side from (service, postcode) — never
  // trust a client-supplied total. The same inputs produced the prepare amount
  // moments earlier. The full breakdown is snapshotted onto the row so later
  // pricing changes never apply retroactively.
  let price;
  try {
    price = await calculatePrice(input.serviceId, input.postcode);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pricing failed";
    return { ok: false, error: message };
  }

  const { data, error } = await supabase
    .from("bookings")
    .insert({
      customer_id: customerId,
      service_id: input.serviceId,
      vehicle_reg: input.vehicleReg,
      vehicle_make: input.vehicleMake,
      vehicle_model: input.vehicleModel ?? null,
      scheduled_at: input.scheduledAt,
      status: "sourcing_mechanic",
      total_pence: price.totalPence,
      area_id: price.areaId,
      base_price_pence: price.basePence,
      labour_multiplier: price.labourMultiplier,
      parts_price_pence: price.partsPence,
      commission_rate: price.commissionRate,
      platform_fee_pence: price.platformFeePence,
      mechanic_payout_pence: price.mechanicPayoutPence,
      stripe_payment_intent_id: input.stripePaymentIntentId ?? null,
      customer_email: input.customerEmail,
      customer_name: input.customerName,
      address_line_1: input.addressLine1,
      address_line_2: input.addressLine2 ?? null,
      parking_type: input.parkingType,
      special_instructions: input.specialInstructions ?? null,
      postcode: input.postcode,
      preferred_mechanic_id: input.preferredMechanicId ?? null,
      payment_mode: mode,
    })
    .select("id")
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

  // Snapshot the service's configured parts as booking line items (see Task 10
  // Stage 2). Service-role; default sourcing 'self'. Non-fatal.
  try {
    const { createAdminClient: mk } = await import("@/lib/supabase/admin");
    const { getConfiguredParts } = await import("@/lib/parts/service-parts");
    const admin = mk();
    const parts = await getConfiguredParts(input.serviceId, admin);
    if (parts.length > 0) {
      await admin.from("booking_parts").insert(
        parts.map((p) => ({
          booking_id: data.id,
          part_id: p.partId,
          part_name: p.name,
          quantity: p.quantity,
          unit_price_pence: p.unitPricePence,
          total_pence: p.totalPence,
          sourcing: "self",
          status: "pending",
        })),
      );
    }
  } catch (err) {
    console.error("Failed to snapshot booking parts for", data.id, err);
  }

  // Record the final funnel step (server-side so it's never lost to navigation).
  void trackEvent(FUNNEL_EVENTS.bookingConfirmed, {
    bookingId: data.id,
    serviceId: input.serviceId,
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
  sendEmail({
    to: input.customerEmail,
    subject: "Booking received — we're finding your mechanic",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #1e3a8a;">Your booking is confirmed!</h1>
        <p>Hi ${input.customerName},</p>
        <p>We've received your booking and are now matching you with the best available mechanic in your area. You'll hear from us as soon as one accepts — usually within minutes.</p>
        <table style="width:100%; border-collapse: collapse; margin: 24px 0;">
          <tr><td style="padding: 8px 0; color: #64748b; font-size: 14px;">Booking ref</td><td style="padding: 8px 0; font-weight: 600;">${data.id.slice(0, 8).toUpperCase()}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b; font-size: 14px;">Vehicle</td><td style="padding: 8px 0; font-weight: 600;">${input.vehicleReg} — ${input.vehicleMake}${input.vehicleModel ? ` ${input.vehicleModel}` : ""}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b; font-size: 14px;">Service</td><td style="padding: 8px 0; font-weight: 600;">${input.serviceName}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b; font-size: 14px;">Date &amp; time</td><td style="padding: 8px 0; font-weight: 600;">${new Date(input.scheduledAt).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" })}</td></tr>
        </table>
        <p style="font-weight: 600;">${payLine}</p>
        <p style="color: #64748b; font-size: 14px;">No money has left your account yet. Your payment will only be captured once the job is complete and you've signed off.</p>
        <p style="color: #64748b; font-size: 14px;">Questions? Email us at <a href="mailto:help@bookmytech.co.uk">help@bookmytech.co.uk</a></p>
      </div>
    `,
  }).catch(console.error);

  return { ok: true, bookingId: data.id };
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
 * The pre-authorisation hold is ALWAYS taken at booking (owner decision
 * 2026-06-05) — trusted/loyalty status never skips it:
 *   • 'preauth' (default) → a manual-capture PaymentIntent for (total − credit)
 *     is held now and captured on completion. Guests have no credit, so this is
 *     the unchanged guest path.
 *   • 'free' → the only no-card case: account credit covers the whole total, so
 *     there is genuinely nothing to authorise.
 */
export async function prepareCheckout(input: {
  serviceId: string;
  postcode: string;
}): Promise<PrepareCheckoutResult> {
  let totalPence: number;
  try {
    const price = await calculatePrice(input.serviceId, input.postcode);
    totalPence = price.totalPence;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Pricing failed" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const customerId = user?.id ?? null;

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
    return { ok: false, error: "Stripe is not configured. Add STRIPE_SECRET_KEY to .env.local." };
  }

  try {
    const intent = await stripe.paymentIntents.create({
      amount: chargePence,
      currency: "gbp",
      capture_method: "manual",
      description: "Book My Tech — service pre-authorisation",
    });
    if (!intent.client_secret) return { ok: false, error: "No client secret from Stripe." };
    return {
      ok: true,
      mode: "preauth",
      clientSecret: intent.client_secret,
      totalPence,
      creditAppliedPence: creditApplied,
      chargePence,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Stripe error" };
  }
}
