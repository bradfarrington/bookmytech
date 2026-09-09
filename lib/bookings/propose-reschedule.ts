import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { sendSms } from "@/lib/sms/send-sms";
import { renderSmsTemplate } from "@/lib/sms/render-template";
import { formatBookingSlot } from "@/lib/slots";
import { siteUrl } from "@/lib/utils";

// The one implementation of "the mechanic proposes a new time" (Task 38 —
// extracted from app/actions/mechanic-jobs.ts, which now calls it). The
// proposal is stored on the booking and the customer told; the booking keeps
// its slot and assignment until they answer (respondToRescheduleFor). Called
// once from the job page and N times from "Running late?" on the day view,
// so the guard and the ownership check belong to the caller: the mechanic id
// here is whatever the trusted layer resolved, never an argument a browser
// supplied.

export type ProposeRescheduleResult = { ok: true } | { ok: false; error: string };

/** Only a confirmed job that hasn't started can be moved by proposal. */
export const PROPOSABLE_STATUSES: readonly string[] = ["confirmed"];

export async function proposeRescheduleFor(
  mechanicId: string,
  bookingId: string,
  newIso: string,
  note: string,
  admin: ReturnType<typeof createAdminClient> = createAdminClient(),
): Promise<ProposeRescheduleResult> {
  const when = new Date(newIso);
  if (!newIso || Number.isNaN(when.getTime())) return { ok: false, error: "Pick a valid new date and time." };
  if (when.getTime() < Date.now()) return { ok: false, error: "The new time must be in the future." };

  const { data: booking } = await admin
    .from("bookings")
    .select("id, status, mechanic_id, scheduled_at, customer_email, customer_name, customer_phone")
    .eq("id", bookingId)
    .single();

  if (!booking) return { ok: false, error: "That job no longer exists." };
  if (booking.mechanic_id !== mechanicId) return { ok: false, error: "This isn't your job." };
  if (!PROPOSABLE_STATUSES.includes(booking.status))
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
    .eq("mechanic_id", mechanicId);
  if (error) return { ok: false, error: error.message };

  await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "reschedule_proposed",
    actor_id: mechanicId,
    actor_role: "mechanic",
    reason: trimmedNote,
    payload: { from: booking.scheduled_at, proposed: when.toISOString() },
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
    renderSmsTemplate("mechanic_proposed_time", { slot: slotLabel, url: `${siteUrl()}/book/confirmed/${bookingId}` })
      .then((body) => sendSms({ to: phone, body }))
      .catch(() => {});
  }
  return { ok: true };
}
