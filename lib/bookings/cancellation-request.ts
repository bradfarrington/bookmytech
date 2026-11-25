import "server-only";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { formatBookingSlot } from "@/lib/slots";
import { formatJobNumber, siteUrl } from "@/lib/utils";

// "Ask Book My Tech to cancel" (0092): a customer who turns down the time
// their mechanic suggested can ask US to cancel instead of cancelling
// themselves. An admin then cancels it from the job page
// (`adminCancelBookingFor`) — charging the fee the booking's time allows, or
// waiving it — or dismisses the request. The customer's entry point is
// `askBookMyTechToCancelFor` in ./manage-booking.ts, which owns the checks.
//
// Stored as booking_events 'note' rows — no new table or event type:
//   payload.kind 'cancellation_requested'          — the ask (reason = why)
//   payload.kind 'cancellation_request_dismissed'  — an admin said no
// The open request is the latest 'cancellation_requested' with no later
// dismissal (`openCancellationRequest`); the admin page only asks while the
// booking is still active.

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "support@bookmytech.co.uk";

export interface OpenCancellationRequest {
  requestedAt: string;
  reason: string | null;
  actorId: string | null;
  actorRole: string | null;
}

/** The unanswered request that we cancel this booking, if there is one. */
export async function openCancellationRequest(
  admin: ReturnType<typeof createAdminClient>,
  bookingId: string,
): Promise<OpenCancellationRequest | null> {
  const { data } = await admin
    .from("booking_events")
    .select("created_at, reason, actor_id, actor_role, payload")
    .eq("booking_id", bookingId)
    .eq("event_type", "note")
    .order("created_at", { ascending: false })
    .limit(50);
  for (const row of data ?? []) {
    const kind = (row.payload as { kind?: string } | null)?.kind;
    if (kind === "cancellation_request_dismissed") return null;
    if (kind === "cancellation_requested")
      return {
        requestedAt: row.created_at,
        reason: row.reason ?? null,
        actorId: row.actor_id ?? null,
        actorRole: row.actor_role ?? null,
      };
  }
  return null;
}

/**
 * Record the customer's ask and email the admin team. The caller has proved
 * the customer and checked the booking; this only writes and tells.
 */
export async function logCancellationRequest(
  admin: ReturnType<typeof createAdminClient>,
  booking: {
    id: string;
    job_number: number | null;
    scheduled_at: string | null;
    slot_window: string | null;
    customer_name: string | null;
  },
  actorId: string | null,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await openCancellationRequest(admin, booking.id))
    return { ok: false, error: "You've already asked us to cancel this booking. We'll be in touch." };

  const { error } = await admin.from("booking_events").insert({
    booking_id: booking.id,
    event_type: "note",
    actor_id: actorId,
    actor_role: "customer",
    reason,
    payload: { kind: "cancellation_requested" },
  });
  if (error) return { ok: false, error: error.message };

  renderTemplateEmail("admin_cancellation_requested", {
    ref: formatJobNumber(booking.job_number),
    customer: booking.customer_name?.trim() || "The customer",
    slot: booking.scheduled_at ? formatBookingSlot(booking.scheduled_at, booking.slot_window) : "no time set",
    reason,
    url: `${siteUrl()}/admin/jobs/${booking.id}`,
  })
    .then(({ subject, html }) => sendEmail({ to: ADMIN_EMAIL, subject, html }))
    .catch(console.error);

  revalidatePath(`/admin/jobs/${booking.id}`);
  return { ok: true };
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
