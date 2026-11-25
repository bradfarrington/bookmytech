import "server-only";

import { pushMechanicUpdate } from "@/lib/push/mechanic-updates";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { sendSms } from "@/lib/sms/send-sms";
import { renderSmsTemplate } from "@/lib/sms/render-template";
import { formatBookingSlot } from "@/lib/slots";
import { rescheduleSlotWindow } from "@/lib/bookings/reschedule-window";
import { dispatchBooking, notifyOfferHoldersOfNewTime } from "@/lib/dispatch/dispatch";
import { sendPushToCustomer } from "@/lib/push/send";
import { logCancellationRequest, openCancellationRequest } from "@/lib/bookings/cancellation-request";
import { formatJobNumber, formatPrice } from "@/lib/utils";
import { ownsBooking, type BookingCaller } from "@/lib/bookings/ownership";
import { splitCommission } from "@/lib/quotes/pricing";
import { chargeIdOf, payoutToMechanic } from "@/lib/payments/payout";

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

export type CustomerBookingResult =
  /** `requested`: a reschedule went to the mechanic to accept (0092), not applied. */
  | { ok: true; requested?: boolean }
  | { ok: false; error: string };

export type { BookingCaller } from "@/lib/bookings/ownership";

/**
 * Statuses each action accepts. Exported because both clients need to decide
 * whether to OFFER the action: a button that always errors is worse than an
 * absent one, and the mobile app hides its buttons off these lists.
 */
export const CANCELLABLE = ["sourcing_mechanic", "confirmed", "en_route"] as const;
export const RESCHEDULABLE = ["sourcing_mechanic", "confirmed"] as const;

// "Thu 4 Sep · 14:00" in UK time, for an exact time with no window (a
// mechanic's proposed move, or a customer's move that kept no window); a
// formatter without an explicit zone printed BST an hour early on Vercel (UTC).
function fmt(iso: string): string {
  return formatBookingSlot(iso);
}

// Look up the assigned mechanic's email so we can tell them the outcome. The
// email lives on the auth user, not the profile, so go through the admin API.
export async function mechanicEmail(
  admin: ReturnType<typeof createAdminClient>,
  mechanicId: string | null,
): Promise<string | null> {
  if (!mechanicId) return null;
  const { data } = await admin.auth.admin.getUserById(mechanicId);
  return data.user?.email ?? null;
}

// The mechanic's mobile for their SMS (Task 22). Lives on `profiles.phone` —
// copied there from their application at approval — which is also what the
// unread-message sweep texts.
export async function mechanicPhone(
  admin: ReturnType<typeof createAdminClient>,
  mechanicId: string | null,
): Promise<string | null> {
  if (!mechanicId) return null;
  const { data } = await admin.from("profiles").select("phone").eq("id", mechanicId).maybeSingle();
  return data?.phone ?? null;
}

const BOOKING_COLUMNS = `id, job_number, status, scheduled_at, slot_window, customer_id, customer_email, customer_name,
  customer_phone, mechanic_id, total_pence, stripe_payment_intent_id, commission_rate,
  reschedule_status, reschedule_proposed_by, reschedule_proposed_at`;

/**
 * Resolve the booking and prove the caller owns it. The rule itself is
 * `ownsBooking` in lib/bookings/ownership.ts — a pure predicate with its own
 * exhaustive tests, shared with the review path.
 */
async function requireBookingCustomer(bookingId: string, caller: BookingCaller) {
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("id", bookingId)
    .single();
  if (!booking) return { ok: false as const, error: "That booking no longer exists." };

  if (!ownsBooking(booking, caller)) return { ok: false as const, error: "This isn't your booking." };

  return { ok: true as const, admin, booking, userId: caller.userId };
}

// Cancellation fee tiers live in platform_settings (pence), tuned on /admin/pricing.
//
// Exported because the public /cancellation-policy page reads the SAME figures.
// A published policy that disagrees with what the code actually charges is worse
// than having no policy page at all, so there is exactly one source for them.
/**
 * The mechanic's text, and the same words to the mechanic app (Task 69) — so a
 * mechanic with the app hears at once, and one without it hears exactly what
 * they always did. The push doesn't wait on there being a phone number.
 */
function textAndPushMechanic(
  mechanicId: string | null,
  bookingId: string,
  phone: string | null,
  title: string,
  sms: Promise<string>,
): void {
  sms
    .then((body) => {
      pushMechanicUpdate(mechanicId, { title, body }, { type: "job", bookingId });
      return phone ? sendSms({ to: phone, body }) : undefined;
    })
    .catch(() => {});
}

export async function cancelFeeTiers(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin
    .from("platform_settings")
    .select("key, value")
    .in("key", [
      "cancel_fee_before_24h",
      "cancel_fee_within_24h",
      "cancel_fee_mechanic_en_route",
      "on_site_diagnostic_fee_pence",
    ]);
  const map = new Map((data ?? []).map((r) => [r.key, Number(r.value)]));
  return {
    before24h: map.get("cancel_fee_before_24h") ?? 0,
    within24h: map.get("cancel_fee_within_24h") ?? 3000,
    enRoute: map.get("cancel_fee_mechanic_en_route") ?? 5000,
    // Task 37: what a mechanic may charge when the customer declines the
    // revised job on site. Read here so the Terms and the policy page show it.
    diagnostic: map.get("on_site_diagnostic_fee_pence") ?? 5999,
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

  return settleCancellation({
    admin,
    booking,
    actorId: userId,
    actorRole: "customer",
    reason: trimmed,
    chargeFee: true,
  });
}

/**
 * A Book My Tech admin cancels on the customer's behalf — typically because
 * the mechanic asked us to (`requestAdminCancellationFor`). The same
 * settlement as the customer's own cancel, so the fee follows the same tiers
 * from the booking's CURRENT time (a reschedule the mechanic never accepted
 * didn't move it). `chargeFee: false` waives it and releases the whole hold.
 * The caller has already proved the admin; `adminId` is for the audit row.
 */
export async function adminCancelBookingFor(
  bookingId: string,
  adminId: string,
  reason: string,
  chargeFee: boolean,
): Promise<CustomerBookingResult & { chargedPence?: number }> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "A cancellation reason is required." };

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select(BOOKING_COLUMNS)
    .eq("id", bookingId)
    .single();
  if (!booking) return { ok: false, error: "Booking not found." };
  if (!(CANCELLABLE as readonly string[]).includes(booking.status))
    return { ok: false, error: "This booking can no longer be cancelled this way." };

  return settleCancellation({
    admin,
    booking: booking as unknown as CancellableBooking,
    actorId: adminId,
    actorRole: "admin",
    reason: trimmed,
    chargeFee,
  });
}

/** What cancelling now would cost, for the admin's confirm — same tiers as the customer's. */
export async function adminCancellationQuoteFor(bookingId: string): Promise<CancellationQuote> {
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("status, scheduled_at, total_pence")
    .eq("id", bookingId)
    .single();
  if (!booking) return { ok: false, error: "Booking not found." };
  if (!(CANCELLABLE as readonly string[]).includes(booking.status))
    return { ok: false, error: "This booking can no longer be cancelled this way." };
  const { feePence, tier } = feeFor(booking.status, booking.scheduled_at, await cancelFeeTiers(admin));
  return { ok: true, feePence, tier, label: FEE_LABELS[tier], totalPence: booking.total_pence ?? 0 };
}

type CancellableBooking = {
  id: string;
  job_number: number | null;
  status: string;
  scheduled_at: string | null;
  customer_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  mechanic_id: string | null;
  stripe_payment_intent_id: string | null;
  commission_rate: number | null;
};

/**
 * Settle a cancellation: capture the fee (or release the hold), close the
 * booking, pay the mechanic their share of any fee, tell everyone. The one
 * implementation behind the customer's cancel and an admin's.
 */
async function settleCancellation({
  admin,
  booking,
  actorId: userId,
  actorRole,
  reason: trimmed,
  chargeFee,
}: {
  admin: ReturnType<typeof createAdminClient>;
  booking: CancellableBooking;
  actorId: string;
  actorRole: "customer" | "admin";
  reason: string;
  chargeFee: boolean;
}): Promise<CustomerBookingResult & { chargedPence?: number }> {
  const bookingId = booking.id;
  const tiers = await cancelFeeTiers(admin);
  const due = feeFor(booking.status, booking.scheduled_at, tiers);
  const { tier } = due;
  const feePence = chargeFee ? due.feePence : 0;

  // Settle the pre-authorisation: capture the fee (releases the remainder) or
  // cancel the hold outright when there's no fee. Stripe-less dev just skips it.
  let charged = 0;
  let chargeId: string | null = null;
  let stripe: typeof import("@/lib/stripe/server").stripe | null = null;
  if (booking.stripe_payment_intent_id) {
    try {
      stripe = (await import("@/lib/stripe/server")).stripe;
    } catch {
      stripe = null;
    }
    if (stripe) {
      try {
        if (feePence > 0) {
          const intent = await stripe.paymentIntents.capture(booking.stripe_payment_intent_id, {
            amount_to_capture: feePence,
          });
          charged = intent.amount_received;
          chargeId = chargeIdOf(intent);
        } else {
          await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Payment error";
        return {
          ok: false,
          error: `Couldn't settle your payment hold: ${message}. Nothing was changed. Try again.`,
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
      reschedule_proposed_by: null,
      reschedule_proposed_window: null,
    })
    .eq("id", bookingId);
  if (error) return { ok: false, error: error.message };

  await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "cancelled",
    actor_id: userId,
    actor_role: actorRole,
    reason: trimmed,
    payload: {
      status_from: booking.status,
      status_to: "cancelled",
      cancelled_by: actorRole,
      fee_tier: tier,
      fee_pence: charged,
      // An admin waiving a fee the tier would have charged.
      ...(!chargeFee && due.feePence > 0 ? { fee_waived_pence: due.feePence } : {}),
    },
  });
  if (charged > 0) {
    await admin.from("booking_events").insert({
      booking_id: bookingId,
      event_type: "payment_captured",
      actor_id: userId,
      actor_role: actorRole,
      payload: { amount_pence: charged, kind: "cancellation_fee" },
    });
    // The fee covers the mechanic's committed time and travel (what the
    // policy page has always said), so it is paid out to them minus the
    // booking's commission, like any other charge (Task 37 — until then it
    // was captured and never paid out).
    if (booking.mechanic_id) {
      const gross = splitCommission(charged, Number(booking.commission_rate ?? 0.15)).mechanicPayoutPence;
      await payoutToMechanic({
        admin,
        stripe,
        bookingId,
        mechanicId: booking.mechanic_id,
        grossPence: gross,
        charges: chargeId ? [{ id: chargeId, capturedPence: charged }] : [],
        description: `Job ${formatJobNumber(booking.job_number)} cancellation fee`,
        actorId: userId,
        actorRole: actorRole,
      });
    }
  }

  // Tell the assigned mechanic their job is off — email and text.
  const byAdmin = actorRole === "admin";
  const cancelMechTo = await mechanicEmail(admin, booking.mechanic_id);
  if (cancelMechTo) {
    renderTemplateEmail(byAdmin ? "mechanic_job_cancelled_by_admin" : "mechanic_job_cancelled", {
      ref: formatJobNumber(booking.job_number),
    })
      .then(({ subject, html }) => sendEmail({ to: cancelMechTo, subject, html }))
      .catch(console.error);
  }
  const cancelMechPhone = await mechanicPhone(admin, booking.mechanic_id);
  textAndPushMechanic(
    booking.mechanic_id,
    bookingId,
    cancelMechPhone,
    byAdmin ? "Book My Tech cancelled the job" : "The customer cancelled",
    renderSmsTemplate(byAdmin ? "mech_job_cancelled_admin" : "mech_job_cancelled", {
      ref: formatJobNumber(booking.job_number),
    }),
  );

  // Confirm to the customer — and when we cancelled it, not they, tell the app
  // at once too: it is news to them.
  if (byAdmin) {
    sendPushToCustomer(booking.customer_id, {
      title: "Your booking was cancelled",
      body:
        charged > 0
          ? `A cancellation fee of ${formatPrice(charged)} was charged. The rest of your hold has been released.`
          : "No fee was charged. Your full hold has been released.",
      bookingId,
    }).catch(() => {});
  }
  // Confirm to the customer.
  const cancelEmail = booking.customer_email;
  if (cancelEmail) {
    const feeLine =
      charged > 0
        ? `A cancellation fee of ${formatPrice(charged)} was charged (${FEE_LABELS[tier].toLowerCase()}). The rest of your pre-authorisation has been released.`
        : "No cancellation fee applied. Your full pre-authorisation has been released.";
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
  revalidatePath("/admin/jobs");
  revalidatePath(`/admin/jobs/${bookingId}`);
  return { ok: true, chargedPence: charged };
}

/**
 * Customer asks for a new slot, keeping the same mechanic.
 *
 * - Still finding a mechanic (`sourcing_mechanic`, nobody assigned): there is
 *   nobody to ask, so the time changes at once, as it always did, and the open
 *   mechanics holding the offer are told (`notifyOfferHoldersOfNewTime`).
 * - Confirmed with a mechanic: it is a REQUEST (0092). The booking keeps its
 *   time — and so its cancellation tier — until the mechanic accepts, declines
 *   or counters (lib/bookings/customer-reschedule.ts). Before this, the move
 *   applied at once, so a customer could push the job a few days out and then
 *   cancel inside the cheaper tier the move had bought. A pending mechanic
 *   proposal is replaced: answering it with a different time is a counter.
 *
 * `slotWindow` (optional, Task 48): the 2-hour arrival window the customer
 * picked, e.g. "2pm–4pm". It is kept only when it is one of the six 2-hour
 * labels AND `newIso` is that window's start (lib/bookings/reschedule-window.ts).
 *
 * Returns `requested: true` when it went to the mechanic rather than moving
 * the booking, so a client can say "sent to your mechanic", not "moved".
 */
export async function rescheduleBookingFor(
  bookingId: string,
  newIso: string,
  reason: string,
  caller: BookingCaller,
  slotWindow?: string | null,
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

  const keptWindow = rescheduleSlotWindow(newIso, slotWindow);
  const trimmed = reason.trim() || null;
  // "Thu 18 Sep · 2pm–4pm" when a window was kept; otherwise the exact time.
  const slotLabel = formatBookingSlot(when.toISOString(), keptWindow);
  const ref = formatJobNumber(booking.job_number);

  if (booking.status === "confirmed" && booking.mechanic_id) {
    return requestRescheduleFromMechanic({
      admin,
      booking,
      userId,
      when,
      keptWindow,
      reason: trimmed,
      slotLabel,
      ref,
    });
  }

  const { error } = await admin
    .from("bookings")
    .update({
      scheduled_at: when.toISOString(),
      // A 2-hour window the customer picked (and whose start is the new time)
      // is kept. Otherwise they picked a specific time, so the arrival window
      // no longer applies: clear it so displays show the exact rescheduled
      // time. Any choice of days they offered (Task 28) is withdrawn either way.
      slot_window: keptWindow,
      candidate_days: null,
      reschedule_proposed_at: null,
      reschedule_note: null,
      reschedule_status: null,
      reschedule_proposed_by: null,
      reschedule_proposed_window: null,
    })
    .eq("id", bookingId)
    // Re-asserted: a mechanic accepting between the read and this write turns
    // it into a confirmed booking, which must go through the request path.
    .eq("status", booking.status)
    .is("mechanic_id", null);
  if (error) return { ok: false, error: error.message };

  await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "reschedule_accepted",
    actor_id: userId,
    actor_role: "customer",
    reason: trimmed,
    payload: {
      from: booking.scheduled_at,
      to: when.toISOString(),
      by: "customer",
      // Additive (Task 48): present only when a window was kept, so an
      // exact-time move's event is exactly what it always was.
      ...(keptWindow ? { slot_window: keptWindow } : {}),
    },
  });

  // Mechanics holding the offer hear the new time.
  await notifyOfferHoldersOfNewTime(bookingId);

  const rescheduleEmail = booking.customer_email;
  if (rescheduleEmail) {
    renderTemplateEmail("booking_rescheduled", {
      name: booking.customer_name ?? "there",
      slot: slotLabel,
    })
      .then(({ subject, html }) => sendEmail({ to: rescheduleEmail, subject, html }))
      .catch(console.error);
  }
  if (booking.customer_phone) {
    const phone = booking.customer_phone;
    renderSmsTemplate("booking_rescheduled", { slot: slotLabel })
      .then((body) => sendSms({ to: phone, body }))
      .catch(() => {});
  }

  revalidatePath("/dashboard");
  revalidatePath(`/book/confirmed/${bookingId}`);
  revalidatePath("/admin/jobs");
  revalidatePath("/mechanic/jobs");
  return { ok: true };
}

/** The confirmed-booking half of `rescheduleBookingFor`: ask, don't move. */
async function requestRescheduleFromMechanic({
  admin,
  booking,
  userId,
  when,
  keptWindow,
  reason,
  slotLabel,
  ref,
}: {
  admin: ReturnType<typeof createAdminClient>;
  booking: {
    id: string;
    status: string;
    scheduled_at: string | null;
    slot_window: string | null;
    mechanic_id: string | null;
  };
  userId: string;
  when: Date;
  keptWindow: string | null;
  reason: string | null;
  slotLabel: string;
  ref: string;
}): Promise<CustomerBookingResult> {
  const { error } = await admin
    .from("bookings")
    .update({
      reschedule_status: "proposed",
      reschedule_proposed_by: "customer",
      reschedule_proposed_at: when.toISOString(),
      reschedule_proposed_window: keptWindow,
      reschedule_note: reason,
    })
    .eq("id", booking.id)
    .eq("status", "confirmed")
    .eq("mechanic_id", booking.mechanic_id!);
  if (error) return { ok: false, error: error.message };

  await admin.from("booking_events").insert({
    booking_id: booking.id,
    event_type: "reschedule_requested",
    actor_id: userId,
    actor_role: "customer",
    reason,
    payload: {
      from: booking.scheduled_at,
      proposed: when.toISOString(),
      ...(keptWindow ? { slot_window: keptWindow } : {}),
    },
  });

  const current = booking.scheduled_at
    ? formatBookingSlot(booking.scheduled_at, booking.slot_window)
    : "the current time";
  const mechTo = await mechanicEmail(admin, booking.mechanic_id);
  if (mechTo) {
    renderTemplateEmail("mechanic_reschedule_requested", {
      slot: slotLabel,
      current,
      optional_note: reason ? `The customer's note: "${reason}"` : "",
    })
      .then(({ subject, html }) => sendEmail({ to: mechTo, subject, html }))
      .catch(console.error);
  }
  const mechPhone = await mechanicPhone(admin, booking.mechanic_id);
  textAndPushMechanic(booking.mechanic_id, booking.id, mechPhone, "The customer asked to move the job",
    renderSmsTemplate("mech_reschedule_requested", { ref, slot: slotLabel }));

  revalidatePath("/dashboard");
  revalidatePath(`/book/confirmed/${booking.id}`);
  revalidatePath("/mechanic/jobs");
  revalidatePath(`/mechanic/jobs/${booking.id}`);
  return { ok: true, requested: true };
}

/**
 * Customer takes back a time they asked for and the mechanic hasn't answered.
 * The booking was never moved, so there is nothing to undo but the request.
 */
export async function withdrawRescheduleRequestFor(
  bookingId: string,
  caller: BookingCaller,
): Promise<CustomerBookingResult> {
  const guard = await requireBookingCustomer(bookingId, caller);
  if (!guard.ok) return guard;
  const { admin, booking, userId } = guard;
  if (booking.reschedule_status !== "proposed" || booking.reschedule_proposed_by !== "customer")
    return { ok: false, error: "There's no request to withdraw. Refresh the page." };

  const { error } = await admin
    .from("bookings")
    .update({
      reschedule_status: null,
      reschedule_proposed_by: null,
      reschedule_proposed_at: null,
      reschedule_proposed_window: null,
      reschedule_note: null,
    })
    .eq("id", bookingId)
    .eq("reschedule_status", "proposed")
    .eq("reschedule_proposed_by", "customer");
  if (error) return { ok: false, error: error.message };

  await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "reschedule_withdrawn",
    actor_id: userId,
    actor_role: "customer",
    payload: { proposed: booking.reschedule_proposed_at },
  });

  // App only: the request it cancels was a push and an email, and a second
  // email to say "never mind" is noise.
  pushMechanicUpdate(
    booking.mechanic_id,
    { title: "Request withdrawn", body: `The customer no longer needs job ${formatJobNumber(booking.job_number)} moved.` },
    { type: "job", bookingId },
  );

  revalidatePath("/dashboard");
  revalidatePath(`/book/confirmed/${bookingId}`);
  revalidatePath("/mechanic/jobs");
  revalidatePath(`/mechanic/jobs/${bookingId}`);
  return { ok: true };
}

/** A mechanic's proposal (or counter-offer) the customer has yet to answer. */
function awaitingCustomer(booking: {
  status: string;
  mechanic_id: string | null;
  reschedule_status: string | null;
  reschedule_proposed_by: string | null;
}): boolean {
  return (
    booking.status === "confirmed" &&
    !!booking.mechanic_id &&
    booking.reschedule_status === "proposed" &&
    booking.reschedule_proposed_by !== "customer"
  );
}

/**
 * The customer turns down the time their mechanic suggested and has the job
 * offered to OTHER mechanics instead, at a time they choose — the time they
 * first asked for, by default, which the app pre-fills (it is on the counter's
 * `reschedule_proposed` event as payload.requested). Owner's call, 2026-11-25.
 *
 * The booking moves to that time, drops back to `sourcing_mechanic` with no
 * mechanic, and is dispatched afresh. The previous mechanic's offer is marked
 * declined so they aren't offered it again; everyone else's old offer row is
 * removed so they are (and get the usual new-offer push). The card hold is
 * untouched: the booking carries on, only the mechanic changes.
 */
export async function findAnotherMechanicFor(
  bookingId: string,
  newIso: string,
  caller: BookingCaller,
  slotWindow?: string | null,
): Promise<CustomerBookingResult> {
  const when = new Date(newIso);
  if (!newIso || Number.isNaN(when.getTime()))
    return { ok: false, error: "Pick a valid new date and time." };
  if (when.getTime() < Date.now())
    return { ok: false, error: "The new time must be in the future." };

  const guard = await requireBookingCustomer(bookingId, caller);
  if (!guard.ok) return guard;
  const { admin, booking, userId } = guard;
  if (!awaitingCustomer(booking))
    return { ok: false, error: "There's no new time from your mechanic to answer. Refresh the page." };

  const previous = booking.mechanic_id!;
  const keptWindow = rescheduleSlotWindow(newIso, slotWindow);

  const { error } = await admin
    .from("bookings")
    .update({
      mechanic_id: null,
      status: "sourcing_mechanic",
      scheduled_at: when.toISOString(),
      slot_window: keptWindow,
      candidate_days: null,
      reschedule_status: null,
      reschedule_proposed_by: null,
      reschedule_proposed_at: null,
      reschedule_proposed_window: null,
      reschedule_note: null,
    })
    .eq("id", bookingId)
    .eq("status", "confirmed")
    .eq("mechanic_id", previous);
  if (error) return { ok: false, error: error.message };

  await admin
    .from("job_offers")
    .update({ response: "declined", responded_at: new Date().toISOString() })
    .eq("booking_id", bookingId)
    .eq("mechanic_id", previous);
  await admin.from("job_offers").delete().eq("booking_id", bookingId).neq("mechanic_id", previous);

  await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "mechanic_reassigned",
    actor_id: userId,
    actor_role: "customer",
    reason: "The customer turned down the mechanic's new time and asked for another mechanic.",
    payload: {
      previous_mechanic_id: previous,
      by: "customer",
      from: booking.scheduled_at,
      to: when.toISOString(),
      status_from: "confirmed",
      status_to: "sourcing_mechanic",
      ...(keptWindow ? { slot_window: keptWindow } : {}),
    },
  });

  pushMechanicUpdate(
    previous,
    {
      title: "Job moved to another mechanic",
      body: `The customer needed a different time for job ${formatJobNumber(booking.job_number)}, so it's been offered to other mechanics.`,
    },
    { type: "job", bookingId },
  );

  // A dispatch hiccup must not fail the customer's choice — the stall sweep
  // and the admin pick it up, as after any redistribute.
  try {
    await dispatchBooking(bookingId);
  } catch (err) {
    console.error("[find-another-mechanic] dispatch failed", bookingId, err);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/book/confirmed/${bookingId}`);
  revalidatePath("/mechanic/jobs");
  revalidatePath(`/mechanic/jobs/${bookingId}`);
  revalidatePath("/admin/jobs");
  revalidatePath(`/admin/jobs/${bookingId}`);
  return { ok: true };
}

/**
 * The customer turns down the time their mechanic suggested and asks Book My
 * Tech to cancel, rather than cancelling themselves. The proposal is declined
 * — the booking keeps its original time, and the mechanic is told as for any
 * decline — and the admin team is asked (lib/bookings/cancellation-request.ts).
 * An admin then cancels, charging the fee the booking's time allows or waiving
 * it, or dismisses the request.
 */
export async function askBookMyTechToCancelFor(
  bookingId: string,
  reason: string,
  caller: BookingCaller,
): Promise<CustomerBookingResult> {
  const trimmed = reason.trim().slice(0, 1000);
  if (!trimmed) return { ok: false, error: "Tell us why you'd like it cancelled." };

  const guard = await requireBookingCustomer(bookingId, caller);
  if (!guard.ok) return guard;
  const { admin, booking, userId } = guard;
  if (!awaitingCustomer(booking))
    return { ok: false, error: "There's no new time from your mechanic to answer. Refresh the page." };
  if (await openCancellationRequest(admin, bookingId))
    return { ok: false, error: "You've already asked us to cancel this booking. We'll be in touch." };

  const declined = await respondToRescheduleFor(bookingId, "decline", caller);
  if (!declined.ok) return declined;

  return logCancellationRequest(admin, booking, userId, trimmed);
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
      `id, job_number, status, customer_id, customer_email, mechanic_id, scheduled_at, slot_window,
       reschedule_status, reschedule_proposed_at, reschedule_note, reschedule_proposed_by`,
    )
    .eq("id", bookingId)
    .single();

  if (!booking) return { ok: false, error: "That booking no longer exists." };

  if (caller && !ownsBooking(booking, caller))
    return { ok: false, error: "This isn't your booking." };

  if (booking.reschedule_status !== "proposed" || !booking.reschedule_proposed_at)
    return {
      ok: false,
      error: "There's no reschedule waiting on a response. Refresh the page.",
    };
  // The customer's OWN request (0092) is the mechanic's to answer, not theirs.
  if (booking.reschedule_proposed_by === "customer")
    return {
      ok: false,
      error: "Your mechanic hasn't answered your new time yet.",
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
      // applies — clear it (and any offered days, Task 28) and let displays
      // fall back to the exact time.
      ...(accepted ? { slot_window: null, candidate_days: null } : {}),
      // Proposal consumed either way — returns both sides to the normal
      // confirmed state (no lingering banners).
      reschedule_proposed_at: null,
      reschedule_note: null,
      reschedule_status: null,
      reschedule_proposed_by: null,
      reschedule_proposed_window: null,
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

  // Tell the mechanic the outcome so they don't have to keep checking — email
  // and text. On a decline the job stays where it was, window and all.
  const proposedLabel = fmt(proposed);
  const originalLabel = original
    ? formatBookingSlot(original, booking.slot_window)
    : proposedLabel;
  const ref = formatJobNumber(booking.job_number);
  const outcomeTo = await mechanicEmail(admin, booking.mechanic_id);
  if (outcomeTo) {
    const email = accepted
      ? renderTemplateEmail("mechanic_reschedule_accepted", { proposed: proposedLabel })
      : renderTemplateEmail("mechanic_reschedule_declined", { original: originalLabel });
    email
      .then(({ subject, html }) => sendEmail({ to: outcomeTo, subject, html }))
      .catch(console.error);
  }
  const outcomePhone = await mechanicPhone(admin, booking.mechanic_id);
  textAndPushMechanic(
    booking.mechanic_id,
    bookingId,
    outcomePhone,
    accepted ? "New time agreed" : "New time declined",
    accepted
      ? renderSmsTemplate("mech_reschedule_accepted", { ref, slot: proposedLabel })
      : renderSmsTemplate("mech_reschedule_declined", { ref, original: originalLabel }),
  );

  revalidatePath(`/book/confirmed/${bookingId}`);
  revalidatePath("/dashboard");
  if (booking.mechanic_id) {
    revalidatePath("/mechanic/jobs");
    revalidatePath(`/mechanic/jobs/${bookingId}`);
  }
  return { ok: true };
}
