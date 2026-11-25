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

// The mechanic accepting a customer's request for a new time (0092) — the
// other half of `rescheduleBookingFor` on a confirmed booking. Shared by the
// website's job page (app/actions/mechanic-jobs.ts) and the mechanic app
// (POST /api/mobile/v1/mechanic/bookings/:id/reschedule-request).
//
// Accepting moves the booking to the time (and arrival window) asked for.
// There is no plain "no" (owner's call, 2026-11-25): a mechanic who can't do
// it suggests another time instead — the ordinary mechanic proposal
// (`proposeRescheduleFor`), which replaces the request. The customer then
// accepts it, keeps their original time, finds another mechanic, or asks Book
// My Tech to cancel (lib/bookings/manage-booking.ts).
//
// The mechanic id is whatever the trusted layer resolved, never a browser's.

export type CustomerRescheduleResult = { ok: true } | MechanicRefusal;

export async function acceptCustomerRescheduleFor(
  mechanicId: string,
  bookingId: string,
): Promise<CustomerRescheduleResult> {
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
  if (new Date(proposed).getTime() < Date.now())
    return refuse("conflict", "That time has already passed. Suggest another time instead.");

  const { error } = await admin
    .from("bookings")
    .update({
      scheduled_at: proposed,
      // The window the customer asked for comes with it; an exact time clears
      // it, as any exact-time move does. Offered days (Task 28) stop meaning
      // anything once the time is agreed.
      slot_window: proposedWindow,
      candidate_days: null,
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
    event_type: "reschedule_accepted",
    actor_id: mechanicId,
    actor_role: "mechanic",
    payload: {
      from: booking.scheduled_at,
      to: proposed,
      by: "mechanic",
      requested_by: "customer",
      ...(proposedWindow ? { slot_window: proposedWindow } : {}),
    },
  });

  const proposedLabel = formatBookingSlot(proposed, proposedWindow);

  const to = booking.customer_email;
  if (to) {
    renderTemplateEmail("booking_rescheduled", {
      name: booking.customer_name ?? "there",
      slot: proposedLabel,
    })
      .then(({ subject, html }) => sendEmail({ to, subject, html }))
      .catch(console.error);
  }
  if (booking.customer_phone) {
    const phone = booking.customer_phone;
    renderSmsTemplate("booking_rescheduled", { slot: proposedLabel })
      .then((body) => sendSms({ to: phone, body }))
      .catch(() => {});
  }
  sendPushToCustomer(booking.customer_id, {
    title: "New time confirmed",
    body: `Your booking is now ${proposedLabel}.`,
    bookingId,
  }).catch(() => {});

  revalidatePath("/mechanic/jobs");
  revalidatePath(`/mechanic/jobs/${bookingId}`);
  revalidatePath("/dashboard");
  revalidatePath(`/book/confirmed/${bookingId}`);
  revalidatePath(`/admin/jobs/${bookingId}`);
  return { ok: true };
}
