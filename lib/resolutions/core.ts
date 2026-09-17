import "server-only";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { ownEvidencePhotos, uploadEvidencePhoto } from "@/lib/disputes/core";
import type { MechanicRefusalCode } from "@/lib/mechanics/refusal";
import { pushMechanicUpdate } from "@/lib/push/mechanic-updates";
import {
  MIN_DESCRIPTION_CHARS,
  MAX_DESCRIPTION_CHARS,
  RESOLUTION_STATUS_LABELS,
  type ResolutionStatus,
} from "@/lib/resolutions/constants";
import { siteUrl, formatJobNumber } from "@/lib/utils";

// The Resolution Center's party actions — "Get help" — in one place (Task 69).
//
// Two callers, two ways of knowing who is acting, the same split as
// lib/disputes/core.ts and for the same reasons:
//
//   • the website — app/actions/resolutions.ts, thin "use server" wrappers that
//     resolve the caller, and whether they are staff, from the session COOKIE;
//   • the mechanic app — app/api/mobile/v1/mechanic/cases/**, which resolves the
//     caller from a verified Bearer token and always acts as a MECHANIC, even
//     for an admin who also works jobs: the app is a mechanic's tool, and
//     `role: "admin"` here means "any case, any job".
//
// So the caller is a PARAMETER, never derived, and never an argument of a
// "use server" export. The three tables have SELECT policies only (0032/0085);
// every write goes through the service role here, so the checks below are the
// whole of the protection.
//
// Cases are INTERNAL: mechanic ↔ Book My Tech. Nothing here contacts the
// customer. (The admin's customer email/SMS and job redistribution stay in the
// action file — admin-only, and not for either app.)

export interface ResolutionCaller {
  userId: string;
  role: "mechanic" | "admin";
}

export interface ResolutionRefusal {
  ok: false;
  error: string;
  /** For the mechanic app's routes; absent = 409. The website ignores it. */
  code?: MechanicRefusalCode;
}
export type ResolutionResult = { ok: true; caseId: string } | ResolutionRefusal;
export type ResolutionMessageResult = { ok: true; id?: string } | ResolutionRefusal;
export type SimpleResult = { ok: true } | ResolutionRefusal;

type Admin = ReturnType<typeof createAdminClient>;

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "support@bookmytech.co.uk";
export const MAX_CASE_PHOTOS = 6;

/** The mechanic's email lives on the auth user, not the profile. */
async function mechanicEmail(admin: Admin, mechanicId: string | null): Promise<string | null> {
  if (!mechanicId) return null;
  const { data } = await admin.auth.admin.getUserById(mechanicId);
  return data.user?.email ?? null;
}

// ---------------------------------------------------------------------------
// Evidence — one photo into job-media/cases/<uploader>/… (the same checks,
// types and 10 MB as a dispute photo).
// ---------------------------------------------------------------------------

export async function uploadCasePhotoFor(
  file: File,
  callerId: string,
): Promise<{ ok: true; url: string } | ResolutionRefusal> {
  return uploadEvidencePhoto(file, callerId, "cases");
}

// ---------------------------------------------------------------------------
// Notifications — staff only (admin + the mechanic). NEVER the customer.
// Templates are editable at /admin/emails (email_templates overrides).
// ---------------------------------------------------------------------------

async function notifyCaseOpened(
  admin: Admin,
  args: {
    caseId: string;
    booking: { id: string; job_number: number | null; mechanic_id: string | null; repair_description: string | null };
    openerRole: "mechanic" | "admin";
    reasonLabel: string;
  },
) {
  const { caseId, booking, openerRole, reasonLabel } = args;
  const svc = booking.repair_description ?? "Vehicle repair";
  const ref = formatJobNumber(booking.job_number);

  // Admin team — always notified of a new case.
  renderTemplateEmail("resolution_opened_admin", {
    opener_role: openerRole,
    service: svc,
    ref,
    reason: reasonLabel,
    link: `${siteUrl()}/admin/resolutions/${caseId}`,
  })
    .then(({ subject, html }) => sendEmail({ to: ADMIN_EMAIL, subject, html }))
    .catch((e) => console.error("resolution admin email failed", e));

  // The mechanic — notified when they aren't the one who raised it.
  if (openerRole === "admin") {
    pushMechanicUpdate(
      booking.mechanic_id,
      { title: "Book My Tech opened a case", body: `${reasonLabel} · job ${ref}` },
      { type: "case", caseId },
    );
    const to = await mechanicEmail(admin, booking.mechanic_id);
    if (to) {
      renderTemplateEmail("resolution_opened_mechanic", {
        service: svc,
        ref,
        reason: reasonLabel,
        link: `${siteUrl()}/mechanic/resolutions/${caseId}`,
      })
        .then(({ subject, html }) => sendEmail({ to, subject, html }))
        .catch((e) => console.error("resolution mechanic email failed", e));
    }
  }
}

// ---------------------------------------------------------------------------
// Open a case (mechanic or admin)
// ---------------------------------------------------------------------------

export interface OpenCaseInput {
  bookingId: string;
  reasonId: string;
  description: string;
  /** URLs from `uploadCasePhotoFor`. Anything that isn't the caller's own upload is dropped. */
  photos?: unknown;
}

export async function openResolutionCaseFor(input: OpenCaseInput, caller: ResolutionCaller): Promise<ResolutionResult> {
  const admin = createAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select("id, job_number, mechanic_id, repair_description")
    .eq("id", input.bookingId)
    .maybeSingle<{ id: string; job_number: number | null; mechanic_id: string | null; repair_description: string | null }>();
  if (!booking) return { ok: false, code: "not_found", error: "That job no longer exists." };
  if (!booking.mechanic_id)
    return { ok: false, error: "That job isn't assigned to a mechanic yet." };

  // A mechanic can only raise a case on their OWN assigned job.
  if (caller.role === "mechanic" && booking.mechanic_id !== caller.userId)
    return { ok: false, code: "forbidden", error: "You can only raise a case on a job assigned to you." };

  const description = (input.description ?? "").trim();
  if (description.length < MIN_DESCRIPTION_CHARS)
    return { ok: false, code: "invalid", error: `Please add at least ${MIN_DESCRIPTION_CHARS} characters.` };
  if (description.length > MAX_DESCRIPTION_CHARS)
    return { ok: false, code: "invalid", error: "That description is too long." };

  const { data: reason } = await admin
    .from("resolution_reasons")
    .select("id, label, active")
    .eq("id", input.reasonId)
    .maybeSingle();
  if (!reason || !reason.active) return { ok: false, code: "invalid", error: "Pick a reason." };

  const photos = ownEvidencePhotos(admin, input.photos, caller.userId, "cases", MAX_CASE_PHOTOS);

  const { data: kase, error } = await admin
    .from("resolution_cases")
    .insert({
      booking_id: booking.id,
      mechanic_id: booking.mechanic_id,
      opened_by: caller.userId,
      opened_by_role: caller.role,
      reason_id: reason.id,
      reason_label: reason.label,
      description,
      status: "open",
      // Named only when used, so a case without photos still opens on a
      // database that has 0032's tables but not 0085's column.
      ...(photos.length ? { photos } : {}),
    })
    .select("id")
    .single();
  if (error || !kase) return { ok: false, code: "failed", error: error?.message ?? "Couldn't open the case." };

  await admin.from("booking_events").insert({
    booking_id: booking.id,
    event_type: "resolution_opened",
    actor_id: caller.userId,
    actor_role: caller.role,
    reason: reason.label,
    payload: { case_id: kase.id },
  });

  // Notify staff (never the customer). Best-effort + non-fatal.
  await notifyCaseOpened(admin, {
    caseId: kase.id,
    booking,
    openerRole: caller.role,
    reasonLabel: reason.label,
  });

  revalidatePath("/mechanic/resolutions");
  revalidatePath("/admin/resolutions");
  return { ok: true, caseId: kase.id };
}

// ---------------------------------------------------------------------------
// Thread messages (mechanic or admin)
// ---------------------------------------------------------------------------

export async function postResolutionMessageFor(
  caseId: string,
  body: string,
  caller: ResolutionCaller,
): Promise<ResolutionMessageResult> {
  const trimmed = (body ?? "").trim();
  if (!trimmed) return { ok: false, code: "invalid", error: "Write a message first." };

  const admin = createAdminClient();
  const { data: kase } = await admin
    .from("resolution_cases")
    .select("id, mechanic_id")
    .eq("id", caseId)
    .maybeSingle();
  if (!kase) return { ok: false, code: "not_found", error: "That case no longer exists." };
  // Mechanics may only post into their own case; admins into any.
  if (caller.role === "mechanic" && kase.mechanic_id !== caller.userId)
    return { ok: false, code: "forbidden", error: "Not authorised." };

  const { data: inserted, error } = await admin
    .from("resolution_messages")
    .insert({
      case_id: caseId,
      sender_id: caller.userId,
      sender_role: caller.role,
      body: trimmed,
    })
    .select("id")
    .single();
  if (error) return { ok: false, code: "failed", error: error.message };

  // Until now an admin's reply reached a mechanic only if they went and looked.
  if (caller.role === "admin") {
    pushMechanicUpdate(kase.mechanic_id, { title: "Book My Tech replied", body: trimmed.slice(0, 120) }, { type: "case", caseId });
  }

  revalidatePath(`/mechanic/resolutions/${caseId}`);
  revalidatePath(`/admin/resolutions/${caseId}`);
  return { ok: true, id: inserted?.id as string | undefined };
}

// ---------------------------------------------------------------------------
// Status changes
// ---------------------------------------------------------------------------

export async function updateResolutionStatusFor(
  caseId: string,
  status: ResolutionStatus,
  note: string | undefined,
  caller: ResolutionCaller,
): Promise<SimpleResult> {
  const admin = createAdminClient();
  const { data: kase } = await admin
    .from("resolution_cases")
    .select("id, mechanic_id")
    .eq("id", caseId)
    .maybeSingle();
  if (!kase) return { ok: false, code: "not_found", error: "That case no longer exists." };
  // A mechanic may only close their own case; admins can set any status.
  if (caller.role === "mechanic" && (kase.mechanic_id !== caller.userId || status !== "closed"))
    return { ok: false, code: "forbidden", error: "Not authorised." };

  const resolving = status === "resolved" || status === "closed";
  const { error } = await admin
    .from("resolution_cases")
    .update({
      status,
      resolution_note: note?.trim() || null,
      resolved_by: resolving ? caller.userId : null,
      resolved_at: resolving ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", caseId);
  if (error) return { ok: false, code: "failed", error: error.message };

  if (caller.role === "admin" && resolving) {
    pushMechanicUpdate(
      kase.mechanic_id,
      { title: "Book My Tech replied", body: note?.trim().slice(0, 120) || `Your case is now ${RESOLUTION_STATUS_LABELS[status].toLowerCase()}.` },
      { type: "case", caseId },
    );
  }

  revalidatePath(`/mechanic/resolutions/${caseId}`);
  revalidatePath(`/admin/resolutions/${caseId}`);
  revalidatePath("/admin/resolutions");
  return { ok: true };
}
