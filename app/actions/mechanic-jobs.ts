"use server";

import { revalidatePath } from "next/cache";
import { requireMechanic } from "@/lib/mechanics/require-mechanic";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchBooking } from "@/lib/dispatch/dispatch";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";

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
    .select("id, status, mechanic_id, customer_email, customer_name")
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

  revalidatePath("/mechanic/jobs");
  revalidatePath(`/mechanic/jobs/${bookingId}`);
  return { ok: true };
}

/**
 * Propose a new time slot to the customer. We store the proposal on the booking
 * and notify the customer; the booking keeps its current slot + assignment
 * until the customer responds. The customer accept/decline/counter UI lands in
 * Task 09 — for now the proposal sits in reschedule_status = 'proposed'.
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
    .select("id, status, mechanic_id, scheduled_at, customer_email, customer_name")
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

  const slotLabel = when.toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short" });

  // Notify the customer of the proposed slot. Their accept/decline/counter
  // path is Task 09; until that ships the email is the only touchpoint.
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

  revalidatePath("/mechanic/jobs");
  revalidatePath(`/mechanic/jobs/${bookingId}`);
  return { ok: true };
}
