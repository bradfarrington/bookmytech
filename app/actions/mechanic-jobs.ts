"use server";

import { revalidatePath } from "next/cache";
import { requireMechanic } from "@/lib/mechanics/require-mechanic";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchBooking } from "@/lib/dispatch/dispatch";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { sendSms } from "@/lib/sms/send-sms";
import { renderSmsTemplate } from "@/lib/sms/render-template";
import { proposeRescheduleFor } from "@/lib/bookings/propose-reschedule";
import { setArrivalWindowFor } from "@/lib/mechanics/set-arrival-window";

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
          ? "This job is already under way. Manage it from the mobile app."
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
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  // The core lives in lib/bookings/propose-reschedule.ts (Task 38), shared
  // with "Running late?" on the day view, which proposes for several jobs.
  const res = await proposeRescheduleFor(guard.mechanicId, bookingId, newIso, note);
  if (!res.ok) return res;
  revalidatePath("/mechanic/jobs");
  revalidatePath(`/mechanic/jobs/${bookingId}`);
  return { ok: true };
}

/**
 * Running late (Task 38): propose a new time for several of today's later
 * jobs in one go — each customer gets the same email/SMS and the same
 * accept/decline banner as a single proposal. One guard, N proposals; a job
 * that can't be moved (already en route, not yours, in the past) is reported
 * by id and the others still go through.
 */
export async function proposeReschedules(
  items: Array<{ bookingId: string; newIso: string }>,
  note: string,
): Promise<{ ok: true; proposed: number; failed: Array<{ bookingId: string; error: string }> } | { ok: false; error: string }> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  const list = Array.isArray(items) ? items.slice(0, 20) : [];
  if (list.length === 0) return { ok: false, error: "Pick at least one job to move." };
  const admin = createAdminClient();
  let proposed = 0;
  const failed: Array<{ bookingId: string; error: string }> = [];
  for (const item of list) {
    if (typeof item?.bookingId !== "string" || typeof item?.newIso !== "string") continue;
    const res = await proposeRescheduleFor(guard.mechanicId, item.bookingId, item.newIso, note ?? "", admin);
    if (res.ok) {
      proposed += 1;
      revalidatePath(`/mechanic/jobs/${item.bookingId}`);
    } else failed.push({ bookingId: item.bookingId, error: res.error });
  }
  revalidatePath("/mechanic/jobs");
  return { ok: true, proposed, failed };
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
 *
 * A FLEXIBLE booking (Task 28) — the customer offered several days — takes
 * `dayKey` as well: one of `candidate_days`. The pick lands on that day (which
 * may be later than the earliest day `scheduled_at` was parked on), and
 * `candidate_days` is cleared; the offered set goes into the event payload.
 * Day and window are one move, and the same one shot.
 */
export async function setArrivalWindow(
  bookingId: string,
  window: string,
  dayKey?: string,
): Promise<MechanicJobResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  // Shared with the mechanic app's route handler.
  const result = await setArrivalWindowFor(guard.mechanicId, bookingId, window, dayKey);
  return result.ok ? result : { ok: false, error: result.error };
}
