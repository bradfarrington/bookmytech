"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { sendSms } from "@/lib/sms/send-sms";
import { formatPrice } from "@/lib/utils";

export type CustomerBookingResult = { ok: true } | { ok: false; error: string };

// Customer-side booking actions for the confirmation tracker + dashboard.
//
// Trust model mirrors the guest confirmation page (book/confirmed/[id]): a
// customer is identified by possession of the booking's full UUID, so these run
// through the service-role client keyed by id. Each action re-reads the booking
// and gates hard on its current state (e.g. a reschedule can only be answered
// while it's actually 'proposed'), so a stale page can't drive a bad write.

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "full",
    timeStyle: "short",
  });
}

// Look up the assigned mechanic's email so we can tell them the outcome. The
// email lives on the auth user, not the profile, so go through the admin API.
async function mechanicEmail(
  admin: ReturnType<typeof createAdminClient>,
  mechanicId: string | null,
): Promise<string | null> {
  if (!mechanicId) return null;
  const { data } = await admin.auth.admin.getUserById(mechanicId);
  return data.user?.email ?? null;
}

/**
 * Customer responds to a mechanic-proposed reschedule (the other half of
 * proposeReschedule in mechanic-jobs.ts). On accept the booking moves to the
 * proposed slot; on decline it keeps its original slot. Either way the proposal
 * is consumed (reschedule_* cleared) and the mechanic is emailed the outcome.
 */
export async function respondToReschedule(
  bookingId: string,
  decision: "accept" | "decline",
): Promise<CustomerBookingResult> {
  const admin = createAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id, status, mechanic_id, scheduled_at, reschedule_status, reschedule_proposed_at, reschedule_note",
    )
    .eq("id", bookingId)
    .single();

  if (!booking) return { ok: false, error: "That booking no longer exists." };
  if (booking.reschedule_status !== "proposed" || !booking.reschedule_proposed_at)
    return {
      ok: false,
      error: "There's no reschedule waiting on a response — refresh the page.",
    };

  const proposed = booking.reschedule_proposed_at;
  const original = booking.scheduled_at;
  const accepted = decision === "accept";

  const { error } = await admin
    .from("bookings")
    .update({
      // On accept, move to the proposed slot; on decline keep the original.
      scheduled_at: accepted ? proposed : original,
      // Proposal consumed either way — returns both sides to the normal
      // confirmed state (no lingering banners).
      reschedule_proposed_at: null,
      reschedule_note: null,
      reschedule_status: null,
    })
    .eq("id", bookingId)
    .eq("reschedule_status", "proposed");
  if (error) return { ok: false, error: error.message };

  await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: accepted ? "reschedule_accepted" : "reschedule_declined",
    // actor_id left null: a guest responding from their confirmation link has no
    // profile row. The role records that the customer made the call.
    actor_id: null,
    actor_role: "customer",
    payload: { from: original, proposed, decision },
  });

  // Tell the mechanic the outcome so they don't have to keep checking.
  const to = await mechanicEmail(admin, booking.mechanic_id);
  if (to) {
    sendEmail({
      to,
      subject: accepted
        ? "Your reschedule was accepted"
        : "Your reschedule was declined",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1e3a8a;">${
            accepted ? "New time confirmed" : "Customer kept the original time"
          }</h1>
          <p>${
            accepted
              ? `The customer accepted your proposed time. This job is now booked for <strong>${fmt(
                  proposed,
                )}</strong>.`
              : `The customer declined the new time. The job stays at its original slot of <strong>${fmt(
                  original ?? proposed,
                )}</strong>.`
          }</p>
          <p style="color: #64748b; font-size: 14px;">View it on your dashboard.</p>
        </div>
      `,
    }).catch(console.error);
  }

  revalidatePath(`/book/confirmed/${bookingId}`);
  revalidatePath("/dashboard");
  if (booking.mechanic_id) {
    revalidatePath("/mechanic/jobs");
    revalidatePath(`/mechanic/jobs/${bookingId}`);
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Cancel + reschedule from the dashboard. These are customer-initiated, so they
// require a signed-in customer who owns the booking (unlike the reschedule
// *response* above, which a guest can reach from their confirmation link).
// ---------------------------------------------------------------------------

async function requireBookingCustomer(bookingId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Please sign in." };

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select(
      `id, status, scheduled_at, customer_id, customer_email, customer_name, customer_phone,
       mechanic_id, total_pence, stripe_payment_intent_id`,
    )
    .eq("id", bookingId)
    .single();
  if (!booking) return { ok: false as const, error: "That booking no longer exists." };

  const owns =
    booking.customer_id === user.id ||
    (!booking.customer_id && booking.customer_email === user.email);
  if (!owns) return { ok: false as const, error: "This isn't your booking." };

  return { ok: true as const, admin, booking, userId: user.id };
}

// Cancellation fee tiers live in platform_settings (pence), tuned on /admin/pricing.
async function cancelFeeTiers(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin
    .from("platform_settings")
    .select("key, value")
    .in("key", [
      "cancel_fee_before_24h",
      "cancel_fee_within_24h",
      "cancel_fee_mechanic_en_route",
    ]);
  const map = new Map((data ?? []).map((r) => [r.key, Number(r.value)]));
  return {
    before24h: map.get("cancel_fee_before_24h") ?? 0,
    within24h: map.get("cancel_fee_within_24h") ?? 3000,
    enRoute: map.get("cancel_fee_mechanic_en_route") ?? 5000,
  };
}

// Which tier applies, given the booking's status + how close the slot is.
function feeFor(
  status: string,
  scheduledAt: string | null,
  tiers: { before24h: number; within24h: number; enRoute: number },
): { feePence: number; tier: "before_24h" | "within_24h" | "en_route" } {
  if (status === "en_route") return { feePence: tiers.enRoute, tier: "en_route" };
  const slotMs = scheduledAt ? new Date(scheduledAt).getTime() : null;
  const within24h = slotMs != null && slotMs - Date.now() < 24 * 60 * 60 * 1000;
  return within24h
    ? { feePence: tiers.within24h, tier: "within_24h" }
    : { feePence: tiers.before24h, tier: "before_24h" };
}

const FEE_LABELS: Record<string, string> = {
  before_24h: "Cancelled more than 24 hours before your slot",
  within_24h: "Cancelled within 24 hours of your slot",
  en_route: "Cancelled while your mechanic was on the way",
};

const CANCELLABLE = ["sourcing_mechanic", "confirmed", "en_route"];

export type CancellationQuote =
  | { ok: true; feePence: number; tier: string; label: string; totalPence: number }
  | { ok: false; error: string };

/** Fee preview shown before the customer confirms a cancellation. */
export async function quoteCancellation(bookingId: string): Promise<CancellationQuote> {
  const guard = await requireBookingCustomer(bookingId);
  if (!guard.ok) return guard;
  const { admin, booking } = guard;
  if (!CANCELLABLE.includes(booking.status))
    return { ok: false, error: "This booking can no longer be cancelled." };

  const tiers = await cancelFeeTiers(admin);
  const { feePence, tier } = feeFor(booking.status, booking.scheduled_at, tiers);
  return {
    ok: true,
    feePence,
    tier,
    label: FEE_LABELS[tier],
    totalPence: booking.total_pence ?? 0,
  };
}

/**
 * Cancel a booking. The cancellation fee (if any) is captured from the
 * pre-authorised hold and the remainder released; a £0 fee releases the whole
 * hold. Fee is recomputed server-side at cancel time — never trusted from the
 * client preview.
 */
export async function cancelBooking(
  bookingId: string,
  reason: string,
): Promise<CustomerBookingResult> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "Please tell us why you're cancelling." };

  const guard = await requireBookingCustomer(bookingId);
  if (!guard.ok) return guard;
  const { admin, booking, userId } = guard;
  if (!CANCELLABLE.includes(booking.status))
    return { ok: false, error: "This booking can no longer be cancelled." };

  const tiers = await cancelFeeTiers(admin);
  const { feePence, tier } = feeFor(booking.status, booking.scheduled_at, tiers);

  // Settle the pre-authorisation: capture the fee (releases the remainder) or
  // cancel the hold outright when there's no fee. Stripe-less dev just skips it.
  let charged = 0;
  if (booking.stripe_payment_intent_id) {
    let stripe: typeof import("@/lib/stripe/server").stripe | null = null;
    try {
      stripe = (await import("@/lib/stripe/server")).stripe;
    } catch {
      stripe = null;
    }
    if (stripe) {
      try {
        if (feePence > 0) {
          await stripe.paymentIntents.capture(booking.stripe_payment_intent_id, {
            amount_to_capture: feePence,
          });
          charged = feePence;
        } else {
          await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Payment error";
        return {
          ok: false,
          error: `Couldn't settle your payment hold: ${message}. Nothing was changed — try again.`,
        };
      }
    }
  }

  const { error } = await admin
    .from("bookings")
    .update({
      status: "cancelled",
      cancellation_reason: trimmed,
      reschedule_proposed_at: null,
      reschedule_note: null,
      reschedule_status: null,
    })
    .eq("id", bookingId);
  if (error) return { ok: false, error: error.message };

  await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "cancelled",
    actor_id: userId,
    actor_role: "customer",
    reason: trimmed,
    payload: {
      status_from: booking.status,
      status_to: "cancelled",
      cancelled_by: "customer",
      fee_tier: tier,
      fee_pence: charged,
    },
  });
  if (charged > 0) {
    await admin.from("booking_events").insert({
      booking_id: bookingId,
      event_type: "payment_captured",
      actor_id: userId,
      actor_role: "customer",
      payload: { amount_pence: charged, kind: "cancellation_fee" },
    });
  }

  // Tell the assigned mechanic their job is off.
  const mechTo = await mechanicEmail(admin, booking.mechanic_id);
  if (mechTo) {
    sendEmail({
      to: mechTo,
      subject: "A job was cancelled by the customer",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1e3a8a;">Job cancelled</h1>
          <p>The customer cancelled their booking. It's been removed from your jobs.</p>
        </div>
      `,
    }).catch(console.error);
  }

  // Confirm to the customer.
  if (booking.customer_email) {
    sendEmail({
      to: booking.customer_email,
      subject: "Your booking has been cancelled",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1e3a8a;">Booking cancelled</h1>
          <p>Hi ${booking.customer_name ?? "there"},</p>
          <p>Your booking has been cancelled as requested.</p>
          <p style="font-weight: 600;">${
            charged > 0
              ? `A cancellation fee of ${formatPrice(charged)} was charged (${FEE_LABELS[
                  tier
                ].toLowerCase()}). The rest of your pre-authorisation has been released.`
              : "No cancellation fee applied — your full pre-authorisation has been released."
          }</p>
          <p style="color: #64748b; font-size: 14px;">Released holds can take a few days to clear with your bank.</p>
        </div>
      `,
    }).catch(console.error);
  }

  if (booking.customer_phone) {
    sendSms({
      to: booking.customer_phone,
      body:
        charged > 0
          ? `Your Book My Tech booking is cancelled. A ${formatPrice(charged)} cancellation fee was charged; the rest of your hold is released.`
          : `Your Book My Tech booking is cancelled. Your full pre-authorisation has been released.`,
    }).catch(() => {});
  }

  revalidatePath("/dashboard");
  revalidatePath(`/book/confirmed/${bookingId}`);
  if (booking.mechanic_id) {
    revalidatePath("/mechanic/jobs");
    revalidatePath(`/mechanic/jobs/${bookingId}`);
  }
  return { ok: true };
}

const RESCHEDULABLE = ["sourcing_mechanic", "confirmed"];

/**
 * Customer reschedules to a new slot, keeping the same mechanic. Applied
 * directly (not a proposal) — the mechanic is notified and can re-propose or
 * cancel from their own tools if the new time doesn't work for them.
 */
export async function rescheduleBooking(
  bookingId: string,
  newIso: string,
  reason: string,
): Promise<CustomerBookingResult> {
  const when = new Date(newIso);
  if (!newIso || Number.isNaN(when.getTime()))
    return { ok: false, error: "Pick a valid new date and time." };
  if (when.getTime() < Date.now())
    return { ok: false, error: "The new time must be in the future." };

  const guard = await requireBookingCustomer(bookingId);
  if (!guard.ok) return guard;
  const { admin, booking, userId } = guard;
  if (!RESCHEDULABLE.includes(booking.status))
    return { ok: false, error: "This booking can no longer be rescheduled." };

  const trimmed = reason.trim() || null;
  const { error } = await admin
    .from("bookings")
    .update({
      scheduled_at: when.toISOString(),
      // Supersede any pending mechanic proposal — the customer just set the time.
      reschedule_proposed_at: null,
      reschedule_note: null,
      reschedule_status: null,
    })
    .eq("id", bookingId);
  if (error) return { ok: false, error: error.message };

  await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "reschedule_accepted",
    actor_id: userId,
    actor_role: "customer",
    reason: trimmed,
    payload: { from: booking.scheduled_at, to: when.toISOString(), by: "customer" },
  });

  const slotLabel = fmt(when.toISOString());

  const mechTo = await mechanicEmail(admin, booking.mechanic_id);
  if (mechTo) {
    sendEmail({
      to: mechTo,
      subject: "A customer moved their booking",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1e3a8a;">Booking rescheduled</h1>
          <p>The customer moved their booking to <strong>${slotLabel}</strong>. If that
          no longer works for you, you can propose another time or release the job
          from your dashboard.</p>
        </div>
      `,
    }).catch(console.error);
  }

  if (booking.customer_email) {
    sendEmail({
      to: booking.customer_email,
      subject: "Your booking has been rescheduled",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1e3a8a;">New time confirmed</h1>
          <p>Hi ${booking.customer_name ?? "there"},</p>
          <p>Your booking is now set for <strong>${slotLabel}</strong>.</p>
          <p style="color: #64748b; font-size: 14px;">Your pre-authorisation stays in place — no new charge.</p>
        </div>
      `,
    }).catch(console.error);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/book/confirmed/${bookingId}`);
  if (booking.mechanic_id) {
    revalidatePath("/mechanic/jobs");
    revalidatePath(`/mechanic/jobs/${bookingId}`);
  }
  return { ok: true };
}
