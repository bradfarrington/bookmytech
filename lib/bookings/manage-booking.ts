import "server-only";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { sendSms } from "@/lib/sms/send-sms";
import { renderSmsTemplate } from "@/lib/sms/render-template";
import { formatPrice } from "@/lib/utils";
import { ownsBooking, type BookingCaller } from "@/lib/bookings/ownership";

// The one implementation of "cancel this booking", "move this booking" and
// "answer the mechanic's proposed move".
//
// It lives in lib/ for the same reason lib/bookings/create-booking.ts does: TWO
// callers, two different ways of knowing who is asking.
//
//   • the website — app/actions/customer-bookings.ts, thin "use server"
//     wrappers that resolve the customer from the session COOKIE;
//   • the mobile app — app/api/mobile/v1/bookings/[id]/{cancel-quote, cancel,
//     reschedule, reschedule-response}, which resolve the customer from a
//     verified `Authorization: Bearer` token.
//
// So the caller is a PARAMETER here, never something this module derives.
// That split is load-bearing in both directions:
//
//   1. A mobile request carries no cookies. Reaching for the cookie client
//      (lib/supabase/server.ts) from a route handler returns a null session
//      silently, so `requireBookingCustomer` would refuse every mobile request
//      with "Please sign in." no matter how good the Bearer token was.
//
//   2. The caller must NOT become an argument of the "use server" exports.
//      Every export of a "use server" file is a public endpoint the browser can
//      call with arguments of its choosing, so `cancelBooking(id, reason,
//      userId)` would let anyone cancel anyone's booking by knowing its id.
//      The web wrappers take no such argument; they read the caller from the
//      verified session themselves.
//
// Ownership is therefore always decided here, from the caller the trusted layer
// resolved — never from anything the client sent.

export type CustomerBookingResult = { ok: true } | { ok: false; error: string };

export type { BookingCaller } from "@/lib/bookings/ownership";

/**
 * Statuses each action accepts. Exported because both clients need to decide
 * whether to OFFER the action: a button that always errors is worse than an
 * absent one, and the mobile app hides its buttons off these lists.
 */
export const CANCELLABLE = ["sourcing_mechanic", "confirmed", "en_route"] as const;
export const RESCHEDULABLE = ["sourcing_mechanic", "confirmed"] as const;

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
 * Resolve the booking and prove the caller owns it. The rule itself is
 * `ownsBooking` in lib/bookings/ownership.ts — a pure predicate with its own
 * exhaustive tests, shared with the review path.
 */
async function requireBookingCustomer(bookingId: string, caller: BookingCaller) {
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

  if (!ownsBooking(booking, caller)) return { ok: false as const, error: "This isn't your booking." };

  return { ok: true as const, admin, booking, userId: caller.userId };
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

export const FEE_LABELS: Record<string, string> = {
  before_24h: "Cancelled more than 24 hours before your slot",
  within_24h: "Cancelled within 24 hours of your slot",
  en_route: "Cancelled while your mechanic was on the way",
};

export type CancellationQuote =
  | { ok: true; feePence: number; tier: string; label: string; totalPence: number }
  | { ok: false; error: string };

/**
 * Fee preview shown before the customer confirms a cancellation.
 *
 * A preview only — `cancelBookingFor` recomputes the fee at cancel time and
 * never reads this. The tier can genuinely move between the two calls (the
 * 24-hour boundary passes, the mechanic sets off), and what's charged must be
 * what was true when the money moved, not what we quoted a minute earlier.
 */
export async function quoteCancellationFor(
  bookingId: string,
  caller: BookingCaller,
): Promise<CancellationQuote> {
  const guard = await requireBookingCustomer(bookingId, caller);
  if (!guard.ok) return guard;
  const { admin, booking } = guard;
  if (!(CANCELLABLE as readonly string[]).includes(booking.status))
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
export async function cancelBookingFor(
  bookingId: string,
  reason: string,
  caller: BookingCaller,
): Promise<CustomerBookingResult> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "Please tell us why you're cancelling." };

  const guard = await requireBookingCustomer(bookingId, caller);
  if (!guard.ok) return guard;
  const { admin, booking, userId } = guard;
  if (!(CANCELLABLE as readonly string[]).includes(booking.status))
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
  const cancelMechTo = await mechanicEmail(admin, booking.mechanic_id);
  if (cancelMechTo) {
    renderTemplateEmail("mechanic_job_cancelled", {})
      .then(({ subject, html }) => sendEmail({ to: cancelMechTo, subject, html }))
      .catch(console.error);
  }

  // Confirm to the customer.
  const cancelEmail = booking.customer_email;
  if (cancelEmail) {
    const feeLine =
      charged > 0
        ? `A cancellation fee of ${formatPrice(charged)} was charged (${FEE_LABELS[tier].toLowerCase()}). The rest of your pre-authorisation has been released.`
        : "No cancellation fee applied — your full pre-authorisation has been released.";
    renderTemplateEmail("booking_cancelled", {
      name: booking.customer_name ?? "there",
      fee_line: feeLine,
    })
      .then(({ subject, html }) => sendEmail({ to: cancelEmail, subject, html }))
      .catch(console.error);
  }

  if (booking.customer_phone) {
    const body =
      charged > 0
        ? await renderSmsTemplate("booking_cancelled_fee", { fee: formatPrice(charged) })
        : await renderSmsTemplate("booking_cancelled_nofee");
    sendSms({ to: booking.customer_phone, body }).catch(() => {});
  }

  revalidatePath("/dashboard");
  revalidatePath(`/book/confirmed/${bookingId}`);
  if (booking.mechanic_id) {
    revalidatePath("/mechanic/jobs");
    revalidatePath(`/mechanic/jobs/${bookingId}`);
  }
  return { ok: true };
}

/**
 * Customer reschedules to a new slot, keeping the same mechanic. Applied
 * directly (not a proposal) — the mechanic is notified and can re-propose or
 * cancel from their own tools if the new time doesn't work for them.
 */
export async function rescheduleBookingFor(
  bookingId: string,
  newIso: string,
  reason: string,
  caller: BookingCaller,
): Promise<CustomerBookingResult> {
  const when = new Date(newIso);
  if (!newIso || Number.isNaN(when.getTime()))
    return { ok: false, error: "Pick a valid new date and time." };
  if (when.getTime() < Date.now())
    return { ok: false, error: "The new time must be in the future." };

  const guard = await requireBookingCustomer(bookingId, caller);
  if (!guard.ok) return guard;
  const { admin, booking, userId } = guard;
  if (!(RESCHEDULABLE as readonly string[]).includes(booking.status))
    return { ok: false, error: "This booking can no longer be rescheduled." };

  const trimmed = reason.trim() || null;
  const { error } = await admin
    .from("bookings")
    .update({
      scheduled_at: when.toISOString(),
      // The customer picked a specific time, so the arrival window no longer
      // applies — clear it so displays show the exact rescheduled time.
      slot_window: null,
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

  const moveMechTo = await mechanicEmail(admin, booking.mechanic_id);
  if (moveMechTo) {
    renderTemplateEmail("mechanic_booking_rescheduled", { slot: slotLabel })
      .then(({ subject, html }) => sendEmail({ to: moveMechTo, subject, html }))
      .catch(console.error);
  }

  const rescheduleEmail = booking.customer_email;
  if (rescheduleEmail) {
    renderTemplateEmail("booking_rescheduled", {
      name: booking.customer_name ?? "there",
      slot: slotLabel,
    })
      .then(({ subject, html }) => sendEmail({ to: rescheduleEmail, subject, html }))
      .catch(console.error);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/book/confirmed/${bookingId}`);
  if (booking.mechanic_id) {
    revalidatePath("/mechanic/jobs");
    revalidatePath(`/mechanic/jobs/${bookingId}`);
  }
  return { ok: true };
}

/**
 * Customer responds to a mechanic-proposed reschedule (the other half of
 * proposeReschedule in mechanic-jobs.ts). On accept the booking moves to the
 * proposed slot; on decline it keeps its original slot. Either way the proposal
 * is consumed (reschedule_* cleared) and the mechanic is emailed the outcome.
 *
 * `caller` is NULLABLE here, and that asymmetry with cancel/reschedule is
 * deliberate. The website reaches this from the guest confirmation page
 * (/book/confirmed/[id]), where the customer may have no account at all and is
 * identified by possession of the booking's full UUID — the same trust model
 * that page uses for everything else. It passes null.
 *
 * The mobile app always has a verified caller, so it passes one and ownership
 * is enforced: knowing someone else's booking id must not be enough to answer
 * their reschedule. The state gate below (must be 'proposed', and the UPDATE
 * re-asserts it) is what stops a stale page driving a bad write either way.
 */
export async function respondToRescheduleFor(
  bookingId: string,
  decision: "accept" | "decline",
  caller: BookingCaller | null,
): Promise<CustomerBookingResult> {
  const admin = createAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select(
      `id, status, customer_id, customer_email, mechanic_id, scheduled_at,
       reschedule_status, reschedule_proposed_at, reschedule_note`,
    )
    .eq("id", bookingId)
    .single();

  if (!booking) return { ok: false, error: "That booking no longer exists." };

  if (caller && !ownsBooking(booking, caller))
    return { ok: false, error: "This isn't your booking." };

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
      // Accepting sets a specific time, so the original arrival window no longer
      // applies — clear it and let displays fall back to the exact time.
      ...(accepted ? { slot_window: null } : {}),
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
    // actor_id is null for the guest-link path: someone responding from their
    // confirmation link may have no profile row. The role records that the
    // customer made the call either way.
    actor_id: caller?.userId ?? null,
    actor_role: "customer",
    payload: { from: original, proposed, decision },
  });

  // Tell the mechanic the outcome so they don't have to keep checking.
  const outcomeTo = await mechanicEmail(admin, booking.mechanic_id);
  if (outcomeTo) {
    const email = accepted
      ? renderTemplateEmail("mechanic_reschedule_accepted", { proposed: fmt(proposed) })
      : renderTemplateEmail("mechanic_reschedule_declined", { original: fmt(original ?? proposed) });
    email
      .then(({ subject, html }) => sendEmail({ to: outcomeTo, subject, html }))
      .catch(console.error);
  }

  revalidatePath(`/book/confirmed/${bookingId}`);
  revalidatePath("/dashboard");
  if (booking.mechanic_id) {
    revalidatePath("/mechanic/jobs");
    revalidatePath(`/mechanic/jobs/${bookingId}`);
  }
  return { ok: true };
}
