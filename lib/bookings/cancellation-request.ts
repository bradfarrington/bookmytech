import "server-only";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { formatBookingSlot } from "@/lib/slots";
import { formatJobNumber, shortPersonName, siteUrl } from "@/lib/utils";
import { refuse, type MechanicRefusal } from "@/lib/mechanics/refusal";

// "Ask Book My Tech to cancel": a mechanic who doesn't want to keep a booking
// — typically one the customer keeps asking to move (0092) — can't cancel it
// on the customer's account themselves, because a customer cancellation is
// what carries the fee. So they ask us. An admin then cancels it from the job
// page (`adminCancelBookingFor`), charging the fee the booking's time allows
// or waiving it, or dismisses the request.
//
// Stored as booking_events 'note' rows — no new table or event type:
//   payload.kind 'cancellation_requested'  — the mechanic's ask (reason = why)
//   payload.kind 'cancellation_request_dismissed' — an admin said no
// The open request is the latest 'cancellation_requested' with no later
// dismissal, on a booking that is still active (`openCancellationRequest`).
//
// Shared by the website's job page (app/actions/mechanic-jobs.ts) and the
// mechanic app (POST /api/mobile/v1/mechanic/bookings/:id/cancellation-request).

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "support@bookmytech.co.uk";

/** A job the mechanic still holds and hasn't started. */
const REQUESTABLE = ["confirmed", "en_route"];

export async function requestAdminCancellationFor(
  mechanicId: string,
  bookingId: string,
  reason: string,
): Promise<{ ok: true } | MechanicRefusal> {
  const trimmed = reason.trim().slice(0, 1000);
  if (!trimmed) return refuse("invalid", "Tell us why you'd like it cancelled.");

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, job_number, status, mechanic_id, scheduled_at, slot_window")
    .eq("id", bookingId)
    .single();
  if (!booking) return refuse("not_found", "That job no longer exists.");
  if (booking.mechanic_id !== mechanicId) return refuse("forbidden", "This isn't your job.");
  if (!REQUESTABLE.includes(booking.status))
    return refuse("conflict", "This job can't be cancelled any more.");

  const open = await openCancellationRequest(admin, bookingId);
  if (open) return refuse("conflict", "You've already asked us to cancel this job. We'll be in touch.");

  const { error } = await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "note",
    actor_id: mechanicId,
    actor_role: "mechanic",
    reason: trimmed,
    payload: { kind: "cancellation_requested" },
  });
  if (error) return refuse("failed", error.message);

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", mechanicId)
    .maybeSingle();
  renderTemplateEmail("admin_cancellation_requested", {
    ref: formatJobNumber(booking.job_number),
    mechanic: shortPersonName(profile?.full_name) || "A mechanic",
    slot: booking.scheduled_at ? formatBookingSlot(booking.scheduled_at, booking.slot_window) : "no time set",
    reason: trimmed,
    url: `${siteUrl()}/admin/jobs/${bookingId}`,
  })
    .then(({ subject, html }) => sendEmail({ to: ADMIN_EMAIL, subject, html }))
    .catch(console.error);

  revalidatePath(`/admin/jobs/${bookingId}`);
  revalidatePath(`/mechanic/jobs/${bookingId}`);
  return { ok: true };
}

export interface OpenCancellationRequest {
  requestedAt: string;
  reason: string | null;
  mechanicId: string | null;
}

/** The mechanic's unanswered request to cancel this booking, if there is one. */
export async function openCancellationRequest(
  admin: ReturnType<typeof createAdminClient>,
  bookingId: string,
): Promise<OpenCancellationRequest | null> {
  const { data } = await admin
    .from("booking_events")
    .select("created_at, reason, actor_id, payload")
    .eq("booking_id", bookingId)
    .eq("event_type", "note")
    .order("created_at", { ascending: false })
    .limit(50);
  for (const row of data ?? []) {
    const kind = (row.payload as { kind?: string } | null)?.kind;
    if (kind === "cancellation_request_dismissed") return null;
    if (kind === "cancellation_requested")
      return { requestedAt: row.created_at, reason: row.reason ?? null, mechanicId: row.actor_id ?? null };
  }
  return null;
}

/** An admin decided not to cancel. The caller has proved the admin. */
export async function dismissCancellationRequestFor(
  bookingId: string,
  adminId: string,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = createAdminClient();
  if (!(await openCancellationRequest(admin, bookingId)))
    return { ok: false, error: "There's no open request to dismiss." };
  const { error } = await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "note",
    actor_id: adminId,
    actor_role: "admin",
    reason: note.trim() || null,
    payload: { kind: "cancellation_request_dismissed" },
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/jobs/${bookingId}`);
  return { ok: true };
}
