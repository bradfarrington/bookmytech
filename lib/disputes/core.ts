import "server-only";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { siteUrl, formatJobNumber } from "@/lib/utils";
import {
  isValidReason,
  MIN_DESCRIPTION_CHARS,
  MAX_DISPUTE_PHOTOS,
  REASON_LABELS,
} from "@/lib/disputes/constants";

// The one implementation of the dispute lifecycle.
//
// Two callers, two different ways of knowing who is acting:
//
//   • the website — app/actions/disputes.ts, thin "use server" wrappers that
//     resolve the caller from the session COOKIE;
//   • the mobile app — app/api/mobile/v1/{bookings/[id]/disputes,
//     disputes/[id]/messages, disputes/[id]/withdraw, disputes/photos}, which
//     resolve the caller from a verified `Authorization: Bearer` token.
//
// So the caller id is a PARAMETER here, never something this module derives —
// the same split as lib/bookings/create-booking.ts, and load-bearing for the
// same two reasons:
//
//   1. A mobile request carries no cookies. `requireUser()` in app/actions/
//      would resolve to null and refuse every mobile request with "Please sign
//      in." no matter how good the Bearer token was.
//
//   2. The caller must NOT become an argument of the "use server" exports.
//      Every export of a "use server" file is a public endpoint the browser can
//      call with arguments of its choosing, so `openDispute(id, input, userId)`
//      would let anyone dispute anyone's job in their name.
//
// `disputes` and `dispute_messages` have no INSERT/UPDATE policies at all (see
// 0025) — every write goes through the service-role client here, because opening
// a dispute moves the booking's status and resolving one moves money. The party
// checks below are therefore the whole of the protection.
// Reads are the other way round: parties get scoped SELECT policies, so the
// mobile app reads a dispute and its thread straight from Supabase.

export type DisputeResult = { ok: true; disputeId: string } | { ok: false; error: string };
export type SimpleResult = { ok: true } | { ok: false; error: string };

type Admin = ReturnType<typeof createAdminClient>;

const CUSTOMER_DISPUTE_WINDOW_MS = 48 * 60 * 60 * 1000;
const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "help@bookmytech.co.uk";

export interface DisputeBooking {
  id: string;
  job_number: number | null;
  status: string;
  customer_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  mechanic_id: string | null;
  completed_at: string | null;
  total_pence: number | null;
  repair_description: string | null;
}

export const DISPUTE_BOOKING_SELECT =
  "id, job_number, status, customer_id, customer_email, customer_name, mechanic_id, completed_at, total_pence, repair_description";

export function serviceName(b: DisputeBooking): string {
  return b.repair_description ?? "Vehicle repair";
}

/** The mechanic's email lives on the auth user, not the profile. */
export async function mechanicEmail(admin: Admin, mechanicId: string | null): Promise<string | null> {
  if (!mechanicId) return null;
  const { data } = await admin.auth.admin.getUserById(mechanicId);
  return data.user?.email ?? null;
}

// ---------------------------------------------------------------------------
// Photo upload (shared public job-media bucket, under a disputes/ prefix)
// ---------------------------------------------------------------------------

const ALLOWED_PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

/**
 * Store one dispute photo and return its public URL.
 *
 * The bucket is PUBLIC and uploads are service-role only (0011), which is why
 * this is a server round-trip rather than a client upload under RLS: there is no
 * bucket policy that would let a customer write to it, and adding one would open
 * the same bucket that holds every job's media.
 *
 * The returned URL is what goes into `disputes.photos` — the caller uploads
 * first, then opens the dispute with the URLs it got back.
 */
export async function uploadDisputePhotoFor(
  file: File,
  callerId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No photo selected." };
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: "Photo must be 10 MB or smaller." };
  const ext = ALLOWED_PHOTO_TYPES[file.type];
  if (!ext) return { ok: false, error: "Use a JPG, PNG or WebP image." };

  const admin = createAdminClient();
  // Keyed by the uploader, so an object's path always records who put it there.
  const path = `disputes/${callerId}/${Date.now()}-${Math.round(file.size)}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from("job-media")
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, error: upErr.message };

  const {
    data: { publicUrl },
  } = admin.storage.from("job-media").getPublicUrl(path);
  return { ok: true, url: publicUrl };
}

// ---------------------------------------------------------------------------
// Open a dispute (customer or mechanic)
// ---------------------------------------------------------------------------

export interface OpenDisputeInput {
  reasonCategory: string;
  description: string;
  photos?: string[];
  /** Customer only. null/undefined = "just flagging, no refund sought". */
  refundRequestedPence?: number | null;
}

/**
 * Open the one dispute a booking may have.
 *
 * The opener's ROLE is derived from their relationship to the booking, not
 * claimed: whoever is neither its customer nor its mechanic is refused outright.
 * That is also what decides which reason vocabulary applies and which
 * eligibility window — a customer has 48 hours from completion, a mechanic can
 * raise one on an active job.
 */
export async function openDisputeFor(
  bookingId: string,
  input: OpenDisputeInput,
  callerId: string,
): Promise<DisputeResult> {
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select(DISPUTE_BOOKING_SELECT)
    .eq("id", bookingId)
    .single<DisputeBooking>();
  if (!booking) return { ok: false, error: "That booking no longer exists." };

  // Determine the opener's role from their relationship to the booking.
  const isCustomer = booking.customer_id === callerId;
  const isMechanic = booking.mechanic_id === callerId;
  if (!isCustomer && !isMechanic)
    return { ok: false, error: "You're not a party to this booking." };
  const role: "customer" | "mechanic" = isCustomer ? "customer" : "mechanic";

  // Eligibility by role.
  if (role === "customer") {
    if (booking.status !== "completed")
      return { ok: false, error: "You can raise a dispute once the job is complete." };
    const completedMs = booking.completed_at ? new Date(booking.completed_at).getTime() : 0;
    if (!completedMs || Date.now() - completedMs > CUSTOMER_DISPUTE_WINDOW_MS)
      return { ok: false, error: "The 48-hour window to raise a dispute has passed." };
  } else if (!["en_route", "in_progress", "completed"].includes(booking.status)) {
    return { ok: false, error: "You can only raise an issue on an active or completed job." };
  }

  // Validate the input.
  if (!isValidReason(role, input.reasonCategory))
    return { ok: false, error: "Pick a reason for the dispute." };
  const description = input.description.trim();
  if (description.length < MIN_DESCRIPTION_CHARS)
    return { ok: false, error: `Please add at least ${MIN_DESCRIPTION_CHARS} characters describing the issue.` };
  const photos = (input.photos ?? []).slice(0, MAX_DISPUTE_PHOTOS);
  const refundRequested =
    role === "customer" && input.refundRequestedPence != null && input.refundRequestedPence > 0
      ? Math.min(Math.round(input.refundRequestedPence), booking.total_pence ?? 0)
      : null;

  // Insert the dispute (unique on booking_id → at most one).
  const { data: dispute, error } = await admin
    .from("disputes")
    .insert({
      booking_id: bookingId,
      opened_by: callerId,
      opened_by_role: role,
      reason_category: input.reasonCategory,
      description,
      photos,
      refund_requested_pence: refundRequested,
      status: "opened",
    })
    .select("id")
    .single();
  if (error || !dispute) {
    if (error?.code === "23505")
      return { ok: false, error: "There's already an open dispute for this booking." };
    return { ok: false, error: error?.message ?? "Couldn't open the dispute." };
  }

  // Booking → disputed, with an audit event.
  await admin.from("bookings").update({ status: "disputed" }).eq("id", bookingId);
  await admin.from("booking_events").insert({
    booking_id: bookingId,
    event_type: "dispute_opened",
    actor_id: callerId,
    actor_role: role,
    reason: REASON_LABELS[input.reasonCategory] ?? input.reasonCategory,
    payload: { dispute_id: dispute.id, status_from: booking.status },
  });

  // The mechanic's completion payout is NOT touched. Money model (owner
  // decision 2026-08-27): they were paid at completion and keep it; if the
  // resolution refunds the customer, BMT fronts the refund and claws it back
  // through the mechanic ledger (see resolveDispute). `disputes.payout_held`
  // stays false — it's a relic of the reverse-on-open model, which broke
  // because the re-transfer needed platform funds that hadn't settled.

  // Notify the admin team + the other party.
  await notifyDisputeOpened(admin, booking, role, dispute.id);

  revalidatePath("/dashboard");
  revalidatePath(`/book/confirmed/${bookingId}`);
  revalidatePath("/admin/disputes");
  if (booking.mechanic_id) revalidatePath(`/mechanic/jobs/${bookingId}`);
  return { ok: true, disputeId: dispute.id };
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

async function notifyDisputeOpened(
  admin: Admin,
  booking: DisputeBooking,
  openerRole: "customer" | "mechanic",
  disputeId: string,
) {
  const svc = serviceName(booking);
  const ref = formatJobNumber(booking.job_number);

  // Admin team.
  renderTemplateEmail("dispute_opened_admin", {
    opener_role: openerRole,
    service: svc,
    ref,
    link: `${siteUrl()}/admin/disputes/${disputeId}`,
  })
    .then(({ subject, html }) => sendEmail({ to: ADMIN_EMAIL, subject, html }))
    .catch((e) => console.error("dispute admin email failed", e));

  // The other party.
  if (openerRole === "customer") {
    const to = await mechanicEmail(admin, booking.mechanic_id);
    if (to) {
      renderTemplateEmail("dispute_opened_mechanic", {
        service: svc,
        ref,
        link: `${siteUrl()}/mechanic/disputes/${disputeId}`,
      })
        .then(({ subject, html }) => sendEmail({ to, subject, html }))
        .catch((e) => console.error("dispute mechanic email failed", e));
    }
  } else if (booking.customer_email) {
    const to = booking.customer_email;
    renderTemplateEmail("dispute_opened_customer", {
      name: booking.customer_name ?? "there",
      service: svc,
      ref,
      link: `${siteUrl()}/dashboard/disputes/${disputeId}`,
    })
      .then(({ subject, html }) => sendEmail({ to, subject, html }))
      .catch((e) => console.error("dispute customer email failed", e));
  }
}

// ---------------------------------------------------------------------------
// Party access to a dispute (customer / mechanic / admin mediator)
// ---------------------------------------------------------------------------

export interface DisputeRow {
  id: string;
  booking_id: string;
  opened_by: string | null;
  opened_by_role: "customer" | "mechanic";
  status: string;
  payout_held: boolean;
}

/**
 * Load a dispute and work out what the caller is to it. Everything downstream
 * (post a message, withdraw, escalate, arbitrate) gates on the role this
 * returns, and a caller who is none of the three is refused here.
 */
export async function partyForDispute(disputeId: string, callerId: string) {
  const admin = createAdminClient();
  const { data: dispute } = await admin
    .from("disputes")
    .select("id, booking_id, opened_by, opened_by_role, status, payout_held")
    .eq("id", disputeId)
    .single<DisputeRow>();
  if (!dispute) return { ok: false as const, error: "That dispute no longer exists." };

  const { data: booking } = await admin
    .from("bookings")
    .select(DISPUTE_BOOKING_SELECT)
    .eq("id", dispute.booking_id)
    .single<DisputeBooking>();
  if (!booking) return { ok: false as const, error: "That booking no longer exists." };

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", callerId)
    .single();

  // Booking relationship wins over profile role: an admin who is this
  // booking's mechanic acts on the dispute as its mechanic (and so can't
  // arbitrate their own job).
  let role: "customer" | "mechanic" | "admin" | null = null;
  if (booking.customer_id === callerId) role = "customer";
  else if (booking.mechanic_id === callerId) role = "mechanic";
  else if (profile?.role === "admin") role = "admin";
  if (!role) return { ok: false as const, error: "You're not a party to this dispute." };

  return { ok: true as const, admin, dispute, booking, userId: callerId, role };
}

export function revalidateDispute(disputeId: string, bookingId: string) {
  revalidatePath(`/dashboard/disputes/${disputeId}`);
  revalidatePath(`/mechanic/disputes/${disputeId}`);
  revalidatePath(`/admin/disputes/${disputeId}`);
  revalidatePath("/admin/disputes");
  revalidatePath("/dashboard");
  revalidatePath(`/mechanic/jobs/${bookingId}`);
}

// ---------------------------------------------------------------------------
// Thread message — any party posts; the first reply from the non-opener flips
// the dispute opened → responded.
// ---------------------------------------------------------------------------

export async function sendDisputeMessageFor(
  disputeId: string,
  body: string,
  callerId: string,
): Promise<SimpleResult> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Type a message first." };

  const party = await partyForDispute(disputeId, callerId);
  if (!party.ok) return party;
  const { admin, dispute, booking, userId, role } = party;
  if (["resolved", "withdrawn"].includes(dispute.status))
    return { ok: false, error: "This dispute is closed." };

  const { error } = await admin.from("dispute_messages").insert({
    dispute_id: disputeId,
    sender_id: userId,
    sender_role: role,
    body: trimmed,
  });
  if (error) return { ok: false, error: error.message };

  // The non-opener's first message moves the case to 'responded'.
  if (role !== "admin" && role !== dispute.opened_by_role && dispute.status === "opened") {
    await admin
      .from("disputes")
      .update({ status: "responded", response: trimmed, responded_at: new Date().toISOString() })
      .eq("id", disputeId);
    await admin.from("booking_events").insert({
      booking_id: dispute.booking_id,
      event_type: "dispute_responded",
      actor_id: userId,
      actor_role: role,
      payload: { dispute_id: disputeId },
    });
    renderTemplateEmail("dispute_responded_admin", {
      role,
      service: serviceName(booking),
      ref: formatJobNumber(booking.job_number),
      link: `${siteUrl()}/admin/disputes/${disputeId}`,
    })
      .then(({ subject, html }) => sendEmail({ to: ADMIN_EMAIL, subject, html }))
      .catch(() => {});
  }

  // Nudge the mechanic on every new reply from another party so they don't have
  // to be watching the thread (the admin gets the 'responded' email above).
  if (role !== "mechanic") {
    const mechTo = await mechanicEmail(admin, booking.mechanic_id);
    if (mechTo)
      renderTemplateEmail("dispute_new_message_mechanic", {
        role,
        service: serviceName(booking),
        ref: formatJobNumber(booking.job_number),
        link: `${siteUrl()}/mechanic/disputes/${disputeId}`,
      })
        .then(({ subject, html }) => sendEmail({ to: mechTo, subject, html }))
        .catch(() => {});
  }

  revalidateDispute(disputeId, dispute.booking_id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Opener withdraws (satisfied / sorted) — closes with no refund; no money moves.
// Money-bearing outcomes go through admin (resolveDispute).
// ---------------------------------------------------------------------------

export async function withdrawDisputeFor(
  disputeId: string,
  callerId: string,
): Promise<SimpleResult> {
  const party = await partyForDispute(disputeId, callerId);
  if (!party.ok) return party;
  const { admin, dispute, booking, userId, role } = party;

  if (userId !== dispute.opened_by)
    return { ok: false, error: "Only the person who opened the dispute can withdraw it." };
  if (["resolved", "withdrawn"].includes(dispute.status))
    return { ok: false, error: "This dispute is already closed." };

  await admin
    .from("disputes")
    .update({
      status: "withdrawn",
      resolution: "withdrawn",
      resolution_note: "Withdrawn by the person who raised it.",
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
      resolved_by_role: role,
    })
    .eq("id", disputeId);

  // Job goes back to its completed state.
  await admin.from("bookings").update({ status: "completed" }).eq("id", dispute.booking_id);
  await admin.from("booking_events").insert({
    booking_id: dispute.booking_id,
    event_type: "dispute_resolved",
    actor_id: userId,
    actor_role: role,
    reason: "Withdrawn",
    payload: { dispute_id: disputeId, resolution: "withdrawn" },
  });

  // Notify both parties.
  const ref = formatJobNumber(booking.job_number);
  if (booking.customer_email) {
    const to = booking.customer_email;
    renderTemplateEmail("dispute_withdrawn_customer", { service: serviceName(booking), ref })
      .then(({ subject, html }) => sendEmail({ to, subject, html }))
      .catch(() => {});
  }
  const mechTo = await mechanicEmail(admin, booking.mechanic_id);
  if (mechTo)
    renderTemplateEmail("dispute_withdrawn_mechanic", { service: serviceName(booking), ref })
      .then(({ subject, html }) => sendEmail({ to: mechTo, subject, html }))
      .catch(() => {});

  revalidateDispute(disputeId, dispute.booking_id);
  return { ok: true };
}
