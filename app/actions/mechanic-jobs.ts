"use server";

import { revalidatePath } from "next/cache";
import { requireMechanic } from "@/lib/mechanics/require-mechanic";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchBooking } from "@/lib/dispatch/dispatch";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { sendSms } from "@/lib/sms/send-sms";
import { renderSmsTemplate } from "@/lib/sms/render-template";
import { sendPushToCustomer } from "@/lib/push/send";
import { loadArrivalWindowOptions } from "@/lib/mechanics/arrival-windows";
import {
  ALL_DAY_SLOT,
  formatBookingDay,
  formatBookingSlot,
  isSlotBookable,
  londonDateKey,
  slotIso,
  twoHourSlotByWindow,
} from "@/lib/slots";
import { formatJobNumber, shortPersonName, siteUrl } from "@/lib/utils";

export type MechanicJobResult = { ok: true } | { ok: false; error: string };

// Mechanic-side job actions for the desktop detail view (Task 05 Stage 4).
//
// Mechanics have no UPDATE/INSERT rights on bookings or booking_events under
// RLS, so — exactly like accept/decline (job-offers.ts) — we verify the caller
// owns the job in an RLS-aware client, then write via the service-role client.
// Each action re-reads the booking under the admin client and re-checks
// ownership + status before mutating, so a stale page can't drive a bad write.

// Cancellable up to the point work starts. Once en_route/in_progress the
// mechanic manages the live job from the mobile app (Task 06), not here.
const CANCELLABLE = ["confirmed"];

/**
 * Cancel a job the mechanic has accepted. The reason is saved on the booking +
 * an audit event, and the job is re-broadcast to other eligible mechanics. The
 * Stripe pre-authorisation is deliberately left HELD (not cancelled) so it can
 * transfer to whoever completes the replacement job.
 */
export async function cancelOwnJob(
  bookingId: string,
  reason: string,
): Promise<MechanicJobResult> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "Please give a reason for cancelling." };

  const guard = await requireMechanic();
  if (!guard.ok) return guard;

  const admin = createAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select("id, status, mechanic_id, customer_email, customer_name, customer_phone")
    .eq("id", bookingId)
    .single();

  if (!booking) return { ok: false, error: "That job no longer exists." };
  if (booking.mechanic_id !== guard.mechanicId)
    return { ok: false, error: "This isn't your job." };
  if (!CANCELLABLE.includes(booking.status))
    return {
      ok: false,
      error:
        booking.status === "in_progress" || booking.status === "en_route"
          ? "This job is already under way — manage it from the mobile app."
          : "This job can no longer be cancelled.",
    };

  // Release the booking back to the pool: clear the mechanic, drop to
  // sourcing_mechanic, record the reason. The Stripe PaymentIntent
  // (stripe_payment_intent_id) is left untouched — held, not cancelled.
  const { error } = await admin
    .from("bookings")
    .update({
      mechanic_id: null,
      status: "sourcing_mechanic",
      cancellation_reason: trimmed,
      // Clear any pending reschedule proposal — the slot belongs to whoever
      // picks the job up next.
      reschedule_proposed_at: null,
      reschedule_note: null,
      reschedule_status: null,
    })
    .eq("id", bookingId)
    .eq("mechanic_id", guard.mechanicId);
  if (error) return { ok: false, error: error.message };

  await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "cancelled",
    actor_id: guard.mechanicId,
    actor_role: "mechanic",
    reason: trimmed,
    payload: {
      status_from: booking.status,
      status_to: "sourcing_mechanic",
      cancelled_by: "mechanic",
      redispatched: true,
    },
  });

  // Re-broadcast to every other eligible online mechanic (first-to-accept).
  // A dispatch hiccup must not fail the cancel — the admin can hand-assign.
  try {
    await dispatchBooking(bookingId);
  } catch (err) {
    console.error("Re-dispatch failed after mechanic cancel", bookingId, err);
  }

  // Email 1 of 2: tell the customer we're sourcing a replacement. Email 2
  // ("a replacement has accepted") fires from acceptOffer (job-offers.ts) when
  // the next mechanic accepts — it detects the prior 'cancelled' event.
  const replacementEmail = booking.customer_email;
  if (replacementEmail) {
    renderTemplateEmail("finding_replacement", { name: booking.customer_name ?? "there" })
      .then(({ subject, html }) => sendEmail({ to: replacementEmail, subject, html }))
      .catch(console.error);
  }
  if (booking.customer_phone) {
    const phone = booking.customer_phone;
    renderSmsTemplate("finding_replacement")
      .then((body) => sendSms({ to: phone, body }))
      .catch(() => {});
  }

  revalidatePath("/mechanic/jobs");
  revalidatePath(`/mechanic/jobs/${bookingId}`);
  return { ok: true };
}

/**
 * Propose a new time slot to the customer. We store the proposal on the booking
 * and notify the customer; the booking keeps its current slot + assignment
 * until the customer responds (respondToRescheduleFor in lib/bookings).
 */
export async function proposeReschedule(
  bookingId: string,
  newIso: string,
  note: string,
): Promise<MechanicJobResult> {
  const when = new Date(newIso);
  if (!newIso || Number.isNaN(when.getTime()))
    return { ok: false, error: "Pick a valid new date and time." };
  if (when.getTime() < Date.now())
    return { ok: false, error: "The new time must be in the future." };

  const guard = await requireMechanic();
  if (!guard.ok) return guard;

  const admin = createAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select("id, status, mechanic_id, scheduled_at, customer_email, customer_name, customer_phone")
    .eq("id", bookingId)
    .single();

  if (!booking) return { ok: false, error: "That job no longer exists." };
  if (booking.mechanic_id !== guard.mechanicId)
    return { ok: false, error: "This isn't your job." };
  if (!CANCELLABLE.includes(booking.status))
    return { ok: false, error: "Only confirmed jobs that haven't started can be rescheduled." };

  const trimmedNote = note.trim() || null;
  const { error } = await admin
    .from("bookings")
    .update({
      reschedule_proposed_at: when.toISOString(),
      reschedule_note: trimmedNote,
      reschedule_status: "proposed",
    })
    .eq("id", bookingId)
    .eq("mechanic_id", guard.mechanicId);
  if (error) return { ok: false, error: error.message };

  await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "reschedule_proposed",
    actor_id: guard.mechanicId,
    actor_role: "mechanic",
    reason: trimmedNote,
    payload: {
      from: booking.scheduled_at,
      proposed: when.toISOString(),
    },
  });

  // UK-time label ("Thu 4 Sep · 14:00") — a proposal is an exact time, not a window.
  const slotLabel = formatBookingSlot(when.toISOString());

  // Notify the customer of the proposed slot. Email and SMS both point at the
  // confirmation page, which carries the accept/decline banner and works for
  // guests too (it's keyed on the booking's full UUID).
  const proposeEmail = booking.customer_email;
  if (proposeEmail) {
    renderTemplateEmail("mechanic_proposed_time", {
      name: booking.customer_name ?? "there",
      slot: slotLabel,
      optional_note: trimmedNote ? `Note from your mechanic: "${trimmedNote}"` : "",
    })
      .then(({ subject, html }) => sendEmail({ to: proposeEmail, subject, html }))
      .catch(console.error);
  }
  if (booking.customer_phone) {
    const phone = booking.customer_phone;
    renderSmsTemplate("mechanic_proposed_time", {
      slot: slotLabel,
      url: `${siteUrl()}/book/confirmed/${bookingId}`,
    })
      .then((body) => sendSms({ to: phone, body }))
      .catch(() => {});
  }

  revalidatePath("/mechanic/jobs");
  revalidatePath(`/mechanic/jobs/${bookingId}`);
  return { ok: true };
}

/**
 * Narrow an ALL-DAY booking to one of the six 2-hour arrival windows (Task 21).
 *
 * The customer agreed to the whole day, so any window inside it needs no
 * consent from them — unlike `proposeReschedule`, this applies immediately and
 * the customer is simply told. It is ONE SHOT (owner decision 2026-09-03):
 * once a window is set the gate below refuses a second pick, and moving it
 * again means proposing a new time so the customer can agree.
 *
 * Storage is in place: `slot_window` becomes the 2-hour label and
 * `scheduled_at` its start (later on the same UK day, so the cancellation-fee
 * boundary can only move in the customer's favour). Every display path, and
 * the mobile app reading the row directly, shows the narrower window with no
 * further change. The original window is kept in the `arrival_window_set`
 * event (0052).
 */
export async function setArrivalWindow(
  bookingId: string,
  window: string,
): Promise<MechanicJobResult> {
  const slot = twoHourSlotByWindow(window);
  if (!slot) return { ok: false, error: "Pick one of the arrival windows." };

  const guard = await requireMechanic();
  if (!guard.ok) return guard;

  const admin = createAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select(
      `id, job_number, status, mechanic_id, scheduled_at, slot_window, reschedule_status,
       customer_id, customer_email, customer_name, customer_phone, repair_description`,
    )
    .eq("id", bookingId)
    .single();

  if (!booking) return { ok: false, error: "That job no longer exists." };
  if (booking.mechanic_id !== guard.mechanicId)
    return { ok: false, error: "This isn't your job." };
  if (booking.status !== "confirmed")
    return {
      ok: false,
      error:
        booking.status === "en_route" || booking.status === "in_progress"
          ? "This job is already under way — the arrival window can't be changed now."
          : "Only confirmed jobs can have an arrival window set.",
    };
  if (booking.slot_window !== ALL_DAY_SLOT.window) {
    return {
      ok: false,
      error: twoHourSlotByWindow(booking.slot_window)
        ? `You've already confirmed ${booking.slot_window} for this job. To move it, propose a new time so the customer can agree.`
        : "This job has a fixed time rather than an all-day window.",
    };
  }
  if (booking.reschedule_status === "proposed")
    return {
      ok: false,
      error:
        "You've proposed a new time for this job — wait for the customer's answer before choosing an arrival window.",
    };
  if (!booking.scheduled_at) return { ok: false, error: "This job has no date yet." };

  const now = new Date();
  const dayKey = londonDateKey(new Date(booking.scheduled_at));
  const iso = slotIso(dayKey, slot.startHour);
  if (!isSlotBookable(dayKey, slot, now))
    return { ok: false, error: `${slot.window} has already started or is too close — pick a later window.` };

  // Recompute the calendar server-side: a clash with another timed job is a
  // hard refusal whatever the client showed. Off-hours is advisory only.
  const calendar = await loadArrivalWindowOptions(
    admin,
    guard.mechanicId,
    { id: booking.id, scheduled_at: booking.scheduled_at },
    now,
  );
  const option = calendar.options.find((o) => o.window === slot.window);
  if (option?.clash)
    return {
      ok: false,
      error: `That window overlaps job #${option.clash.jobNumber} (${option.clash.window}). Pick a different window.`,
    };

  // Guarded, atomic: every predicate re-asserted in the WHERE so a customer
  // reschedule landing in between (which nulls slot_window), a double submit,
  // or a status change can't be clobbered by a stale form.
  const { data: updated, error } = await admin
    .from("bookings")
    .update({ scheduled_at: iso, slot_window: slot.window })
    .eq("id", bookingId)
    .eq("mechanic_id", guard.mechanicId)
    .eq("status", "confirmed")
    .eq("slot_window", ALL_DAY_SLOT.window)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!updated)
    return { ok: false, error: "This job changed while you were choosing — refresh and try again." };

  const { error: eventErr } = await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "arrival_window_set",
    actor_id: guard.mechanicId,
    actor_role: "mechanic",
    reason: `Arrival window set to ${slot.window} (was ${ALL_DAY_SLOT.window})`,
    payload: {
      from_window: ALL_DAY_SLOT.window,
      to_window: slot.window,
      from: booking.scheduled_at,
      to: iso,
      day: dayKey,
    },
  });
  if (eventErr) {
    // The booking is already narrowed and the customer is about to be told;
    // a missing audit row is worth a loud log, not a failed action.
    console.error(
      "[arrival-window] booking_events insert failed — has migration 0052 been applied?",
      eventErr,
    );
  }

  // Tell the customer: email + push + SMS, all best-effort.
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", guard.mechanicId)
    .single();
  const mechanicName = profile?.full_name ?? "Your mechanic";
  const ref = formatJobNumber(booking.job_number);
  const whenLabel = formatBookingSlot(iso, slot.window);
  const dayLabel = formatBookingDay(iso);

  if (booking.customer_email) {
    const to = booking.customer_email;
    renderTemplateEmail("arrival_window_confirmed", {
      name: booking.customer_name ?? "there",
      mechanic: mechanicName,
      service: booking.repair_description ?? "Vehicle repair",
      ref,
      when: whenLabel,
      window: slot.window,
    })
      .then(({ subject, html }) => sendEmail({ to, subject, html }))
      .catch(console.error);
  }
  sendPushToCustomer(booking.customer_id, {
    title: "Your mechanic has confirmed an arrival window",
    body: `${shortPersonName(profile?.full_name)} will arrive ${slot.window} on ${dayLabel}.`,
    bookingId,
  }).catch(() => {});
  if (booking.customer_phone) {
    const phone = booking.customer_phone;
    renderSmsTemplate("arrival_window_confirmed", {
      mechanic: mechanicName,
      window: slot.window,
      day: dayLabel,
      ref,
    })
      .then((body) => sendSms({ to: phone, body }))
      .catch(() => {});
  }

  revalidatePath("/mechanic/jobs");
  revalidatePath(`/mechanic/jobs/${bookingId}`);
  revalidatePath("/mechanic/schedule");
  revalidatePath("/dashboard");
  revalidatePath(`/book/confirmed/${bookingId}`);
  return { ok: true };
}
