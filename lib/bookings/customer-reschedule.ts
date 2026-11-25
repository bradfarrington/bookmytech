import "server-only";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { sendSms } from "@/lib/sms/send-sms";
import { renderSmsTemplate } from "@/lib/sms/render-template";
import { formatBookingSlot } from "@/lib/slots";
import { refuse, type MechanicRefusal } from "@/lib/mechanics/refusal";
import { sendPushToCustomer } from "@/lib/push/send";

// The mechanic's answer to a customer's request for a new time (0092) — the
// other half of `rescheduleBookingFor` on a confirmed booking. Shared by the
// website's job page (app/actions/mechanic-jobs.ts) and the mechanic app
// (POST /api/mobile/v1/mechanic/bookings/:id/reschedule-request).
//
//   accept  — the booking moves to the time (and arrival window) asked for;
//   decline — it stays where it is.
//
// The third answer, "suggest another time", is not here: it is the ordinary
// mechanic proposal (`proposeRescheduleFor`), which replaces the request and
// which the customer then accepts or declines as they always have.
//
// The mechanic id is whatever the trusted layer resolved, never a browser's.

export type CustomerRescheduleAnswer = "accept" | "decline";
export type CustomerRescheduleResult = { ok: true } | MechanicRefusal;

export async function respondToCustomerRescheduleFor(
  mechanicId: string,
  bookingId: string,
  decision: CustomerRescheduleAnswer,
): Promise<CustomerRescheduleResult> {
  if (decision !== "accept" && decision !== "decline")
    return refuse("invalid", "Choose accept or decline.");

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select(
      `id, status, mechanic_id, customer_id, scheduled_at, slot_window, customer_email, customer_name, customer_phone,
       reschedule_status, reschedule_proposed_by, reschedule_proposed_at, reschedule_proposed_window`,
    )
    .eq("id", bookingId)
    .single();

  if (!booking) return refuse("not_found", "That job no longer exists.");
  if (booking.mechanic_id !== mechanicId) return refuse("forbidden", "This isn't your job.");
  if (
    booking.reschedule_status !== "proposed" ||
    booking.reschedule_proposed_by !== "customer" ||
    !booking.reschedule_proposed_at
  )
    return refuse("conflict", "There's no new time waiting on you. Refresh to see the latest.");
  if (booking.status !== "confirmed")
    return refuse("conflict", "This job can't be moved any more.");

  const proposed: string = booking.reschedule_proposed_at;
  const proposedWindow: string | null = booking.reschedule_proposed_window ?? null;
  const accepted = decision === "accept";
  if (accepted && new Date(proposed).getTime() < Date.now())
    return refuse("conflict", "That time has already passed. Suggest another time instead.");

  const { error } = await admin
    .from("bookings")
    .update({
      ...(accepted
        ? {
            scheduled_at: proposed,
            // The window the customer asked for comes with it; an exact time
            // clears it, as any exact-time move does. Offered days (Task 28)
            // stop meaning anything once the time is agreed.
            slot_window: proposedWindow,
            candidate_days: null,
          }
        : {}),
      reschedule_status: null,
      reschedule_proposed_by: null,
      reschedule_proposed_at: null,
      reschedule_proposed_window: null,
      reschedule_note: null,
    })
    .eq("id", bookingId)
    .eq("mechanic_id", mechanicId)
    .eq("status", "confirmed")
    .eq("reschedule_status", "proposed")
    .eq("reschedule_proposed_by", "customer");
  if (error) return refuse("failed", error.message);

  await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: accepted ? "reschedule_accepted" : "reschedule_declined",
    actor_id: mechanicId,
    actor_role: "mechanic",
    payload: accepted
      ? {
          from: booking.scheduled_at,
          to: proposed,
          by: "mechanic",
          requested_by: "customer",
          ...(proposedWindow ? { slot_window: proposedWindow } : {}),
        }
      : { from: booking.scheduled_at, proposed, requested_by: "customer", decision },
  });

  const proposedLabel = formatBookingSlot(proposed, proposedWindow);
  const originalLabel = booking.scheduled_at
    ? formatBookingSlot(booking.scheduled_at, booking.slot_window)
    : proposedLabel;

  const to = booking.customer_email;
  if (to) {
    const email = accepted
      ? renderTemplateEmail("booking_rescheduled", {
          name: booking.customer_name ?? "there",
          slot: proposedLabel,
        })
      : renderTemplateEmail("reschedule_request_declined", {
          name: booking.customer_name ?? "there",
          proposed: proposedLabel,
          original: originalLabel,
        });
    email.then(({ subject, html }) => sendEmail({ to, subject, html })).catch(console.error);
  }
  if (booking.customer_phone) {
    const phone = booking.customer_phone;
    const sms = accepted
      ? renderSmsTemplate("booking_rescheduled", { slot: proposedLabel })
      : renderSmsTemplate("reschedule_request_declined", {
          proposed: proposedLabel,
          original: originalLabel,
        });
    sms.then((body) => sendSms({ to: phone, body })).catch(() => {});
  }
  sendPushToCustomer(booking.customer_id, {
    title: accepted ? "New time confirmed" : "Your mechanic can't make that time",
    body: accepted
      ? `Your booking is now ${proposedLabel}.`
      : `Your booking stays at ${originalLabel}.`,
    bookingId,
  }).catch(() => {});

  revalidatePath("/mechanic/jobs");
  revalidatePath(`/mechanic/jobs/${bookingId}`);
  revalidatePath("/dashboard");
  revalidatePath(`/book/confirmed/${bookingId}`);
  revalidatePath(`/admin/jobs/${bookingId}`);
  return { ok: true };
}
