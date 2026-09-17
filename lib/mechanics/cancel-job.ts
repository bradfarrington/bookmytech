import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchBooking } from "@/lib/dispatch/dispatch";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { refuse, type MechanicRefusal } from "@/lib/mechanics/refusal";
import { sendSms } from "@/lib/sms/send-sms";
import { renderSmsTemplate } from "@/lib/sms/render-template";

// A mechanic handing back a job they accepted — shared by the website's
// `cancelOwnJob` (app/actions/mechanic-jobs.ts) and the mechanic app's
// POST /api/mobile/v1/mechanic/bookings/[id]/cancel (Task 67). The caller
// resolves the mechanic; this takes the id.

export type CancelJobResult = { ok: true } | MechanicRefusal;

// Cancellable up to the point work starts. Once the mechanic has set off the
// customer is expecting them, and backing out is a conversation with support,
// not a button.
const CANCELLABLE = ["confirmed"];

/**
 * Cancel a job the mechanic has accepted. The reason is saved on the booking +
 * an audit event, and the job is re-broadcast to other eligible mechanics. The
 * Stripe pre-authorisation is deliberately left HELD (not cancelled) so it can
 * transfer to whoever completes the replacement job.
 */
export async function cancelOwnJobFor(
  mechanicId: string,
  bookingId: string,
  reason: string,
): Promise<CancelJobResult> {
  const trimmed = reason.trim();
  if (!trimmed) return refuse("invalid", "Please give a reason for cancelling.");

  const admin = createAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select("id, status, mechanic_id, customer_email, customer_name, customer_phone")
    .eq("id", bookingId)
    .single();

  if (!booking) return refuse("not_found", "That job no longer exists.");
  if (booking.mechanic_id !== mechanicId) return refuse("forbidden", "This isn't your job.");
  if (!CANCELLABLE.includes(booking.status))
    return refuse(
      "conflict",
      booking.status === "in_progress" || booking.status === "en_route"
        ? "This job is already under way, so it can't be cancelled. Message the customer, or contact Book My Tech if you can't carry on."
        : "This job can no longer be cancelled.",
    );

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
    .eq("mechanic_id", mechanicId);
  if (error) return refuse("failed", error.message);

  await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "cancelled",
    actor_id: mechanicId,
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
  // ("a replacement has accepted") fires from acceptOfferFor
  // (lib/mechanics/offers.ts) when the next mechanic accepts — it detects the
  // prior 'cancelled' event.
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
