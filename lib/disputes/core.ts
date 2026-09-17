import "server-only";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { ownsBooking, type BookingCaller } from "@/lib/bookings/ownership";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { siteUrl, formatJobNumber } from "@/lib/utils";
import {
  isValidReason,
  MIN_DESCRIPTION_CHARS,
  MAX_DISPUTE_PHOTOS,
  REASON_LABELS,
} from "@/lib/disputes/constants";
import { pushMechanicUpdate } from "@/lib/push/mechanic-updates";
import type { MechanicRefusalCode } from "@/lib/mechanics/refusal";

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

/**
 * A refusal. `code` is for the MECHANIC app's routes, which answer a refusal
 * with a status (lib/mobile/mechanic-actions.ts): absent means "right caller,
 * wrong moment" (409). The website and the customer app show `error` and
 * ignore it.
 */
export interface DisputeRefusal {
  ok: false;
  error: string;
  code?: MechanicRefusalCode;
}
export type DisputeResult = { ok: true; disputeId: string } | DisputeRefusal;
export type SimpleResult = { ok: true } | DisputeRefusal;
/** `sendDisputeMessageFor`: the new message's id comes back for the apps. */
export type DisputeMessageResult = { ok: true; id?: string } | DisputeRefusal;

type Admin = ReturnType<typeof createAdminClient>;

const CUSTOMER_DISPUTE_WINDOW_MS = 48 * 60 * 60 * 1000;
const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "support@bookmytech.co.uk";

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
): Promise<{ ok: true; url: string } | DisputeRefusal> {
  return uploadEvidencePhoto(file, callerId, "disputes");
}

/** Where evidence lives in `job-media`: dispute photos, and Get-help case photos (Task 69). */
export type EvidenceFolder = "disputes" | "cases";

/** One photo into `job-media/<folder>/<callerId>/…` — the same checks whichever folder. */
export async function uploadEvidencePhoto(
  file: File,
  callerId: string,
  folder: EvidenceFolder,
): Promise<{ ok: true; url: string } | DisputeRefusal> {
  if (!(file instanceof File) || file.size === 0) return { ok: false, code: "invalid", error: "No photo selected." };
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, code: "invalid", error: "Photo must be 10 MB or smaller." };
  const ext = ALLOWED_PHOTO_TYPES[file.type];
  if (!ext) return { ok: false, code: "invalid", error: "Use a JPG, PNG or WebP image." };

  const admin = createAdminClient();
  // Keyed by the uploader, so an object's path always records who put it there.
  const path = `${folder}/${callerId}/${Date.now()}-${Math.round(file.size)}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from("job-media")
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, code: "failed", error: upErr.message };

  const {
    data: { publicUrl },
  } = admin.storage.from("job-media").getPublicUrl(path);
  return { ok: true, url: publicUrl };
}

/**
 * Keep only the URLs this caller got back from `uploadEvidencePhoto` for this
 * folder — the path records who put each object there, so a URL under anyone
 * else's prefix (or anywhere else on the internet) is dropped rather than
 * shown to an admin as "the mechanic's evidence". Capped at `max`.
 */
export function ownEvidencePhotos(
  admin: Admin,
  urls: unknown,
  callerId: string,
  folder: EvidenceFolder,
  max: number = MAX_DISPUTE_PHOTOS,
): string[] {
  if (!Array.isArray(urls)) return [];
  // Asked for a file and trimmed back to its folder: the client tidies a path
  // that ends in a slash, and the slash is the point.
  const {
    data: { publicUrl: probe },
  } = admin.storage.from("job-media").getPublicUrl(`${folder}/${callerId}/x`);
  const prefix = probe.slice(0, -1);
  const own = urls.filter(
    (url): url is string =>
      typeof url === "string" && url.startsWith(prefix) && /^[A-Za-z0-9._-]+$/.test(url.slice(prefix.length)),
  );
  return [...new Set(own)].slice(0, max);
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
  caller: BookingCaller,
): Promise<DisputeResult> {
  const callerId = caller.userId;
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select(DISPUTE_BOOKING_SELECT)
    .eq("id", bookingId)
    .single<DisputeBooking>();
  if (!booking) return { ok: false, code: "not_found", error: "That booking no longer exists." };

  // Determine the opener's role from their relationship to the booking.
  // `ownsBooking` rather than a customer_id comparison, because a booking made
  // before accounts were required has no customer_id and is linked by email.
  // Every other customer action already uses it, so a plain `customer_id ===`
  // here was the one thing standing between those customers and a dispute.
  const isCustomer = ownsBooking(booking, caller);
  const isMechanic = booking.mechanic_id === callerId;
  if (!isCustomer && !isMechanic)
    return { ok: false, code: "forbidden", error: "You're not a party to this booking." };
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
    return { ok: false, code: "invalid", error: "Pick a reason for the dispute." };
  const description = input.description.trim();
  if (description.length < MIN_DESCRIPTION_CHARS)
    return { ok: false, code: "invalid", error: `Please add at least ${MIN_DESCRIPTION_CHARS} characters describing the issue.` };
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
    return { ok: false, code: "failed", error: error?.message ?? "Couldn't open the dispute." };
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
    await notifyMechanicOfDispute(admin, booking, disputeId, "dispute_opened_mechanic", { service: svc, ref }, `${svc} · job ${ref}`);
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

/**
 * Tell the MECHANIC something about a dispute: the email they have always had,
 * and (Task 69) the same news to the mechanic app — the email's own subject as
 * the push title, so the two can't say different things. The push doesn't wait
 * on there being an email address.
 */
export async function notifyMechanicOfDispute(
  admin: Admin,
  booking: Pick<DisputeBooking, "mechanic_id">,
  disputeId: string,
  template: string,
  vars: Record<string, string>,
  pushBody: string,
): Promise<void> {
  if (!booking.mechanic_id) return;
  try {
    const to = await mechanicEmail(admin, booking.mechanic_id);
    const { subject, html } = await renderTemplateEmail(template, {
      ...vars,
      link: `${siteUrl()}/mechanic/disputes/${disputeId}`,
    });
    pushMechanicUpdate(booking.mechanic_id, { title: subject, body: pushBody }, { type: "dispute", disputeId });
    if (to) sendEmail({ to, subject, html }).catch((e) => console.error(`${template} email failed`, e));
  } catch (e) {
    console.error(`${template} notification failed`, e);
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
export async function partyForDispute(disputeId: string, caller: BookingCaller) {
  const callerId = caller.userId;
  const admin = createAdminClient();
  const { data: dispute } = await admin
    .from("disputes")
    .select("id, booking_id, opened_by, opened_by_role, status, payout_held")
    .eq("id", disputeId)
    .single<DisputeRow>();
  if (!dispute) return { ok: false as const, code: "not_found" as const, error: "That dispute no longer exists." };

  const { data: booking } = await admin
    .from("bookings")
    .select(DISPUTE_BOOKING_SELECT)
    .eq("id", dispute.booking_id)
    .single<DisputeBooking>();
  if (!booking) return { ok: false as const, code: "not_found" as const, error: "That booking no longer exists." };

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", callerId)
    .single();

  // Booking relationship wins over profile role: an admin who is this
  // booking's mechanic acts on the dispute as its mechanic (and so can't
  // arbitrate their own job).
  // `ownsBooking` for the customer arm so a guest-era booking (no customer_id,
  // linked by email) can still reply to, withdraw or escalate its dispute.
  let role: "customer" | "mechanic" | "admin" | null = null;
  if (ownsBooking(booking, caller)) role = "customer";
  else if (booking.mechanic_id === callerId) role = "mechanic";
  else if (profile?.role === "admin") role = "admin";
  if (!role) return { ok: false as const, code: "forbidden" as const, error: "You're not a party to this dispute." };

  return { ok: true as const, admin, dispute, booking, userId: callerId, role };
}

export function revalidateDispute(disputeId: string, bookingId: string) {
  revalidatePath(`/dashboard/disputes/${disputeId}`);
  revalidatePath(`/mechanic/disputes/${disputeId}`);
  revalidatePath("/mechanic/disputes");
  revalidatePath(`/admin/disputes/${disputeId}`);
  revalidatePath("/admin/disputes");
  revalidatePath("/dashboard");
  revalidatePath(`/mechanic/jobs/${bookingId}`);
}

// ---------------------------------------------------------------------------
// Thread message — any party posts; the first reply from the non-opener flips
// the dispute opened → responded.
// ---------------------------------------------------------------------------

/** Who a message is for. null = every party; the other two are Book My Tech's private notes. */
export type DisputeMessageAudience = "mechanic" | "customer" | null;

export interface DisputeMessageOptions {
  /** URLs from `uploadDisputePhotoFor`. Anything that isn't the caller's own upload is dropped. */
  photos?: unknown;
  /**
   * ADMIN ONLY (ignored from anyone else): a note only one party can read. The
   * "Parties read dispute thread" policy (0085) is what keeps it from the
   * other — their client never receives the row.
   */
  visibleTo?: DisputeMessageAudience;
}

export async function sendDisputeMessageFor(
  disputeId: string,
  body: string,
  caller: BookingCaller,
  options: DisputeMessageOptions = {},
): Promise<DisputeMessageResult> {
  const party = await partyForDispute(disputeId, caller);
  if (!party.ok) return party;
  const { admin, dispute, booking, userId, role } = party;

  const photos = ownEvidencePhotos(admin, options.photos, userId, "disputes");
  // Photos can stand alone — "here is the receipt" needs no sentence — but the
  // column is never empty, so the thread still reads sensibly without images.
  const trimmed = body.trim() || (photos.length ? `Sent ${photos.length === 1 ? "a photo" : `${photos.length} photos`}.` : "");
  if (!trimmed) return { ok: false, code: "invalid", error: "Type a message first." };
  if (["resolved", "withdrawn"].includes(dispute.status))
    return { ok: false, error: "This dispute is closed." };

  const visibleTo: DisputeMessageAudience =
    role === "admin" && (options.visibleTo === "mechanic" || options.visibleTo === "customer") ? options.visibleTo : null;

  // Only name the new columns when they are used, so a plain message still
  // sends on a database that hasn't had 0085 yet.
  const { data: inserted, error } = await admin
    .from("dispute_messages")
    .insert({
      dispute_id: disputeId,
      sender_id: userId,
      sender_role: role,
      body: trimmed,
      ...(photos.length ? { photos } : {}),
      ...(visibleTo ? { visible_to: visibleTo } : {}),
    })
    .select("id")
    .single();
  if (error) return { ok: false, code: "failed", error: error.message };

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
  // Not for a note meant only for the customer — they can't read it.
  if (role !== "mechanic" && visibleTo !== "customer") {
    await notifyMechanicOfDispute(
      admin,
      booking,
      disputeId,
      "dispute_new_message_mechanic",
      { role, service: serviceName(booking), ref: formatJobNumber(booking.job_number) },
      trimmed.slice(0, 120),
    );
  }

  revalidateDispute(disputeId, dispute.booking_id);
  return { ok: true, id: inserted?.id as string | undefined };
}

// ---------------------------------------------------------------------------
// Escalate to the admin mediator (manual; the cron does it automatically at
// ESCALATION_HOURS). "Ask Book My Tech to step in": it hands the DECISION over,
// it doesn't make one — no money moves and nothing is resolved here.
// ---------------------------------------------------------------------------

export async function escalateDisputeFor(disputeId: string, caller: BookingCaller): Promise<SimpleResult> {
  const party = await partyForDispute(disputeId, caller);
  if (!party.ok) return party;
  const { admin, dispute, booking, userId, role } = party;
  if (role === "admin") return { ok: false, error: "Admins arbitrate escalated disputes directly." };
  if (!["opened", "responded"].includes(dispute.status))
    return { ok: false, error: "This dispute can't be escalated from its current state." };

  await admin
    .from("disputes")
    .update({ status: "escalated", escalated_at: new Date().toISOString() })
    .eq("id", disputeId);
  await admin.from("booking_events").insert({
    booking_id: dispute.booking_id,
    event_type: "dispute_escalated",
    actor_id: userId,
    actor_role: role,
    payload: { dispute_id: disputeId, escalated_by: role },
  });
  renderTemplateEmail("dispute_escalated_admin", {
    role,
    service: serviceName(booking),
    ref: formatJobNumber(booking.job_number),
    link: `${siteUrl()}/admin/disputes/${disputeId}`,
  })
    .then(({ subject, html }) => sendEmail({ to: ADMIN_EMAIL, subject, html }))
    .catch(() => {});

  // Let the mechanic know when the other party escalates (admins can't escalate).
  if (role !== "mechanic") {
    await notifyMechanicOfDispute(
      admin,
      booking,
      disputeId,
      "dispute_escalated_mechanic",
      { role, service: serviceName(booking), ref: formatJobNumber(booking.job_number) },
      "Book My Tech will review it and decide.",
    );
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
  caller: BookingCaller,
): Promise<SimpleResult> {
  const party = await partyForDispute(disputeId, caller);
  if (!party.ok) return party;
  const { admin, dispute, booking, userId, role } = party;

  if (userId !== dispute.opened_by)
    return { ok: false, code: "forbidden", error: "Only the person who opened the dispute can withdraw it." };
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

  // The job goes back to where it was when the dispute was opened. For a
  // customer's dispute that is always `completed`. A MECHANIC can raise one on
  // a job that is still en route or in progress, and marking that `completed`
  // would finish it without the customer ever being charged or the mechanic
  // paid — so put it back where `dispute_opened` recorded it was.
  const { data: opened } = await admin
    .from("booking_events")
    .select("payload")
    .eq("booking_id", dispute.booking_id)
    .eq("event_type", "dispute_opened")
    .eq("payload->>dispute_id", disputeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const before = (opened?.payload as { status_from?: unknown } | null)?.status_from;
  const restoreTo = before === "en_route" || before === "in_progress" ? before : "completed";
  await admin.from("bookings").update({ status: restoreTo }).eq("id", dispute.booking_id);
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
  // The mechanic hears either way by email; the app is only told when it was
  // the CUSTOMER who withdrew — their own withdrawal isn't news to them.
  if (role === "mechanic") {
    const mechTo = await mechanicEmail(admin, booking.mechanic_id);
    if (mechTo)
      renderTemplateEmail("dispute_withdrawn_mechanic", { service: serviceName(booking), ref })
        .then(({ subject, html }) => sendEmail({ to: mechTo, subject, html }))
        .catch(() => {});
  } else {
    await notifyMechanicOfDispute(
      admin,
      booking,
      disputeId,
      "dispute_withdrawn_mechanic",
      { service: serviceName(booking), ref },
      "The customer has withdrawn it. Nothing changes for your payout.",
    );
  }

  revalidateDispute(disputeId, dispute.booking_id);
  return { ok: true };
}
