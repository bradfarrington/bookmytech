"use server";

import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { formatPrice } from "@/lib/utils";
import { dispatchBooking } from "@/lib/dispatch/dispatch";
import { calculatePrice } from "@/lib/pricing/calculate";
import { trackEvent } from "@/app/actions/track-event";
import { FUNNEL_EVENTS } from "@/lib/analytics/events";

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
  stripePaymentIntentId: string;
}

export async function createBookingAction(
  input: CreateBookingInput,
): Promise<{ ok: true; bookingId: string } | { ok: false; error: string }> {
  const supabase = await createClient();

  const { data: session } = await supabase.auth.getSession();
  const customerId = session?.session?.user?.id ?? null;

  // Recompute the canonical price server-side from (service, postcode) — never
  // trust a client-supplied total. The same inputs produced the PaymentIntent
  // amount moments earlier, so this matches what was pre-authorised. The full
  // breakdown is snapshotted onto the row so later pricing changes never apply
  // retroactively.
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
      stripe_payment_intent_id: input.stripePaymentIntentId,
      customer_email: input.customerEmail,
      customer_name: input.customerName,
      address_line_1: input.addressLine1,
      address_line_2: input.addressLine2 ?? null,
      parking_type: input.parkingType,
      special_instructions: input.specialInstructions ?? null,
      postcode: input.postcode,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to create booking" };
  }

  // Record the final funnel step (server-side so it's never lost to navigation).
  void trackEvent(FUNNEL_EVENTS.bookingConfirmed, {
    bookingId: data.id,
    serviceId: input.serviceId,
    totalPence: price.totalPence,
  });

  // Broadcast the job to every eligible online mechanic (first-to-accept wins).
  // Awaited so the offers exist by the time the confirmation page loads, but a
  // dispatch failure must never fail the booking — the admin can still see and
  // hand-assign an undispatched booking.
  try {
    await dispatchBooking(data.id);
  } catch (err) {
    console.error("Dispatch failed for booking", data.id, err);
  }

  // Fire and forget — don't block the redirect on email
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
          <tr><td style="padding: 8px 0; color: #64748b; font-size: 14px;">Amount pre-authorised</td><td style="padding: 8px 0; font-weight: 600;">${formatPrice(price.totalPence)}</td></tr>
        </table>
        <p style="color: #64748b; font-size: 14px;">No money has left your account yet. Your payment will only be captured once the job is complete and you've signed off.</p>
        <p style="color: #64748b; font-size: 14px;">Questions? Email us at <a href="mailto:help@bookmytech.co.uk">help@bookmytech.co.uk</a></p>
      </div>
    `,
  }).catch(console.error);

  return { ok: true, bookingId: data.id };
}

export async function createPaymentIntentAction(input: {
  serviceId: string;
  postcode: string;
}): Promise<
  { ok: true; clientSecret: string; totalPence: number } | { ok: false; error: string }
> {
  // Price the booking server-side from (service, postcode) so the pre-auth
  // amount is the canonical total, not a figure the client could tamper with.
  let totalPence: number;
  try {
    const price = await calculatePrice(input.serviceId, input.postcode);
    totalPence = price.totalPence;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Pricing failed";
    return { ok: false, error: message };
  }

  // Lazy import — Stripe throws if STRIPE_SECRET_KEY is missing at module load.
  // Returning a friendly error here lets the flow work without Stripe keys set.
  let stripe;
  try {
    const mod = await import("@/lib/stripe/server");
    stripe = mod.stripe;
  } catch {
    return { ok: false, error: "Stripe is not configured. Add STRIPE_SECRET_KEY to .env.local." };
  }

  try {
    const intent = await stripe.paymentIntents.create({
      amount: totalPence,
      currency: "gbp",
      capture_method: "manual",
      description: "Book My Tech — service pre-authorisation",
    });
    if (!intent.client_secret) {
      return { ok: false, error: "No client secret returned from Stripe." };
    }
    return { ok: true, clientSecret: intent.client_secret, totalPence };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return { ok: false, error: message };
  }
}
