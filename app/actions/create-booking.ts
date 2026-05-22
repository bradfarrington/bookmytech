"use server";

import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { formatPrice } from "@/lib/utils";

export interface CreateBookingInput {
  vehicleReg: string;
  vehicleMake: string;
  vehicleModel?: string;
  serviceName: string;
  serviceId: string;
  scheduledAt: string; // ISO string
  totalPence: number;
  customerEmail: string;
  customerName: string;
  addressLine1: string;
  addressLine2?: string;
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
      total_pence: input.totalPence,
      stripe_payment_intent_id: input.stripePaymentIntentId,
      customer_email: input.customerEmail,
      customer_name: input.customerName,
      address_line_1: input.addressLine1,
      address_line_2: input.addressLine2 ?? null,
      parking_type: input.parkingType,
      special_instructions: input.specialInstructions ?? null,
      postcode: input.addressLine1.toUpperCase(),
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to create booking" };
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
          <tr><td style="padding: 8px 0; color: #64748b; font-size: 14px;">Deposit pre-authorised</td><td style="padding: 8px 0; font-weight: 600;">${formatPrice(input.totalPence)}</td></tr>
        </table>
        <p style="color: #64748b; font-size: 14px;">No money has left your account yet. Your deposit will only be captured once the job is complete and you've signed off.</p>
        <p style="color: #64748b; font-size: 14px;">Questions? Email us at <a href="mailto:help@bookmytech.co.uk">help@bookmytech.co.uk</a></p>
      </div>
    `,
  }).catch(console.error);

  return { ok: true, bookingId: data.id };
}

export async function createPaymentIntentAction(amountPence: number): Promise<
  { ok: true; clientSecret: string } | { ok: false; error: string }
> {
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
      amount: amountPence,
      currency: "gbp",
      capture_method: "manual",
      description: "Book My Tech — deposit pre-authorisation",
    });
    if (!intent.client_secret) {
      return { ok: false, error: "No client secret returned from Stripe." };
    }
    return { ok: true, clientSecret: intent.client_secret };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe error";
    return { ok: false, error: message };
  }
}
