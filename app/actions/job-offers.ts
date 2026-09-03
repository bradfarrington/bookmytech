"use server";

import { revalidatePath } from "next/cache";
import { requireMechanic } from "@/lib/mechanics/require-mechanic";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { sendPushToCustomer } from "@/lib/push/send";
import { sendSms } from "@/lib/sms/send-sms";
import { renderSmsTemplate } from "@/lib/sms/render-template";
import { ALL_DAY_SLOT, formatBookingSlot } from "@/lib/slots";
import { formatJobNumber, shortPersonName } from "@/lib/utils";

export type OfferActionResult =
  | {
      ok: true;
      bookingId?: string;
      /**
       * The accepted booking is an ALL-DAY one, so the mechanic should be taken
       * straight to the job page to pick a 2-hour arrival window (Task 21).
       */
      needsArrivalWindow?: boolean;
    }
  | { ok: false; error: string };

// All offer mutations verify the caller is the owning mechanic (RLS-aware
// client), then perform privileged writes via the service-role client:
//   - accept assigns the booking + supersedes every sibling offer, and must be
//     atomic across rows — not expressible as a row policy.
//   - decline / supersede touch the offer row only.
export async function acceptOffer(offerId: string): Promise<OfferActionResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;

  const admin = createAdminClient();

  const { data: offer } = await admin
    .from("job_offers")
    .select("id, booking_id, mechanic_id, response")
    .eq("id", offerId)
    .single();

  if (!offer) return { ok: false, error: "That offer no longer exists." };
  if (offer.mechanic_id !== guard.mechanicId)
    return { ok: false, error: "This isn't your offer." };
  if (offer.response)
    return { ok: false, error: "You've already responded to this offer." };

  const now = new Date().toISOString();

  // Atomic first-to-accept: only succeeds if the booking is still unassigned
  // and sourcing. If another mechanic won the race, 0 rows update.
  const { data: claimed, error: claimErr } = await admin
    .from("bookings")
    .update({ mechanic_id: guard.mechanicId, status: "confirmed" })
    .eq("id", offer.booking_id)
    .eq("status", "sourcing_mechanic")
    .is("mechanic_id", null)
    .select("id")
    .maybeSingle();

  if (claimErr) return { ok: false, error: claimErr.message };

  if (!claimed) {
    // Lost the race — mark our offer superseded so it drops off our feed.
    await admin
      .from("job_offers")
      .update({ response: "superseded", responded_at: now })
      .eq("id", offerId)
      .is("response", null);
    revalidatePath("/mechanic/jobs");
    return { ok: false, error: "Another mechanic just accepted this job." };
  }

  // Mark our offer accepted.
  await admin
    .from("job_offers")
    .update({ response: "accepted", responded_at: now })
    .eq("id", offerId);

  // Supersede every other still-live offer for this booking.
  await admin
    .from("job_offers")
    .update({ response: "superseded", responded_at: now })
    .eq("booking_id", offer.booking_id)
    .neq("id", offerId)
    .is("response", null);

  // Was this booking previously assigned-then-cancelled? A prior 'cancelled'
  // event means a mechanic dropped it and it was re-dispatched — so this accept
  // is a *replacement*, and the customer gets the "we found you a replacement"
  // email (the second half of the pair started in mechanic-jobs.ts → cancelOwnJob).
  const { count: priorCancellations } = await admin
    .from("booking_events")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", offer.booking_id)
    .eq("event_type", "cancelled");
  const isReplacement = (priorCancellations ?? 0) > 0;

  // Append-only audit.
  await admin.from("booking_events").insert({
    booking_id: offer.booking_id,
    event_type: isReplacement ? "mechanic_reassigned" : "mechanic_assigned",
    actor_id: guard.mechanicId,
    actor_role: "mechanic",
    payload: {
      mechanic_id: guard.mechanicId,
      via: "offer_accept",
      status_from: "sourcing_mechanic",
      status_to: "confirmed",
      replacement: isReplacement,
    },
  });

  // Confirmation email to the customer. On a first assignment this is the
  // "your mechanic is confirmed" note; on a replacement it reassures them their
  // replacement has accepted and nothing else changes.
  const { data: booking } = await admin
    .from("bookings")
    .select(
      "customer_id, customer_email, customer_name, customer_phone, scheduled_at, slot_window, job_number, repair_description",
    )
    .eq("id", offer.booking_id)
    .single();
  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", guard.mechanicId)
    .single();
  const mechanicName = profile?.full_name ?? "Your mechanic";
  // "Wed 3 Sep · 8am–10am" in UK time — the window the customer picked, not a
  // bare 08:00 (which is what an all-day booking used to be emailed as).
  const slotLabel = formatBookingSlot(booking?.scheduled_at ?? null, booking?.slot_window);
  const isAllDay = booking?.slot_window === ALL_DAY_SLOT.window;
  const ref = formatJobNumber(booking?.job_number);
  const templateKey = isReplacement ? "replacement_confirmed" : "mechanic_confirmed";
  if (booking?.customer_email) {
    const serviceName = booking.repair_description ?? "Vehicle repair";
    const to = booking.customer_email;
    renderTemplateEmail(templateKey, {
      name: booking.customer_name ?? "there",
      mechanic: mechanicName,
      service: serviceName,
      ref,
      when: slotLabel,
      optional_note: isAllDay
        ? "You booked an all-day slot — your mechanic will confirm a 2-hour arrival window for the day."
        : "",
    })
      .then(({ subject, html }) => sendEmail({ to, subject, html }))
      .catch(console.error);
  }

  // Push to the customer's phone alongside the email (push runs alongside
  // SMS/email, never instead). Best-effort; `bookingId` is what the app opens.
  sendPushToCustomer(booking?.customer_id, {
    title: isReplacement ? "Your replacement mechanic is confirmed" : "Your mechanic is confirmed",
    body: `${shortPersonName(profile?.full_name)} has taken your job.`,
    bookingId: offer.booking_id,
  }).catch(() => {});

  // And a text (Task 22) — the same news on the same channels as en-route.
  if (booking?.customer_phone) {
    const phone = booking.customer_phone;
    renderSmsTemplate(templateKey, { mechanic: mechanicName, when: slotLabel, ref })
      .then((body) => sendSms({ to: phone, body }))
      .catch(() => {});
  }

  revalidatePath("/mechanic/jobs");
  // The customer's tracker + dashboard reflect the new assignment.
  revalidatePath(`/book/confirmed/${offer.booking_id}`);
  revalidatePath("/dashboard");
  return { ok: true, bookingId: offer.booking_id, needsArrivalWindow: isAllDay };
}

export async function declineOffer(offerId: string): Promise<OfferActionResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;

  const admin = createAdminClient();

  const { data: offer } = await admin
    .from("job_offers")
    .select("id, mechanic_id, response")
    .eq("id", offerId)
    .single();

  if (!offer) return { ok: false, error: "That offer no longer exists." };
  if (offer.mechanic_id !== guard.mechanicId)
    return { ok: false, error: "This isn't your offer." };
  if (offer.response)
    return { ok: false, error: "You've already responded to this offer." };

  // Decline only removes it from THIS mechanic's feed — every other eligible
  // mechanic still holds their live offer (broadcast model).
  await admin
    .from("job_offers")
    .update({ response: "declined", responded_at: new Date().toISOString() })
    .eq("id", offerId)
    .is("response", null);

  revalidatePath("/mechanic/jobs");
  return { ok: true };
}
