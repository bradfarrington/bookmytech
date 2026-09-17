"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { sendSms } from "@/lib/sms/send-sms";
import { renderTemplateEmail } from "@/emails/resolve";
import { renderSmsTemplate } from "@/lib/sms/render-template";
import type { SmsTemplateKey } from "@/lib/sms/templates";
import { formatPrice, formatJobNumber } from "@/lib/utils";
import { dispatchBooking } from "@/lib/dispatch/dispatch";
import type { ResolutionStatus } from "@/lib/resolutions/constants";
import {
  openResolutionCaseFor,
  postResolutionMessageFor,
  updateResolutionStatusFor,
  type OpenCaseInput,
} from "@/lib/resolutions/core";

export type ResolutionResult = { ok: true; caseId: string } | { ok: false; error: string };
export type SimpleResult = { ok: true } | { ok: false; error: string };

type Admin = ReturnType<typeof createAdminClient>;

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Mechanic or admin — the two roles allowed anywhere in the Resolution Center. */
async function requireStaff() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Please sign in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "mechanic" && profile?.role !== "admin")
    return { ok: false as const, error: "Not authorised." };
  return { ok: true as const, userId: user.id, role: profile.role as "mechanic" | "admin" };
}

/** Admin-only actions (redistribute, customer comms, reason CRUD). */
async function requireAdmin() {
  const guard = await requireStaff();
  if (!guard.ok) return guard;
  if (guard.role !== "admin") return { ok: false as const, error: "Admins only." };
  return { ok: true as const, userId: guard.userId };
}

// ---------------------------------------------------------------------------
// Customer merge-var helper — shared by the email + SMS comms actions.
// ---------------------------------------------------------------------------

interface CommsBooking {
  id: string;
  job_number: number | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  vehicle_reg: string | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  scheduled_at: string | null;
  total_pence: number | null;
  repair_description: string | null;
}

const COMMS_BOOKING_SELECT =
  "id, job_number, customer_name, customer_email, customer_phone, vehicle_reg, vehicle_make, vehicle_model, scheduled_at, total_pence, repair_description";

function serviceName(b: CommsBooking): string {
  return b.repair_description ?? "Vehicle repair";
}

function customerVars(b: CommsBooking): Record<string, string> {
  const vehicle = [b.vehicle_reg, [b.vehicle_make, b.vehicle_model].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(", ");
  const when = b.scheduled_at
    ? new Date(b.scheduled_at).toLocaleString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";
  return {
    name: b.customer_name ?? "there",
    ref: formatJobNumber(b.job_number),
    service: serviceName(b),
    vehicle,
    when,
    pay_line: b.total_pence ? `Amount pre-authorised: ${formatPrice(b.total_pence)}` : "",
  };
}

/** Load the case + its booking, enforcing the caller's read scope. */
async function loadCaseBooking(admin: Admin, caseId: string) {
  const { data: kase } = await admin
    .from("resolution_cases")
    .select("id, booking_id, mechanic_id, status, redistributed")
    .eq("id", caseId)
    .maybeSingle();
  if (!kase) return null;
  const { data: booking } = await admin
    .from("bookings")
    .select(COMMS_BOOKING_SELECT)
    .eq("id", kase.booking_id)
    .maybeSingle<CommsBooking>();
  return booking ? { kase, booking } : null;
}

/** Log an admin-visible audit note into the case thread. */
async function logCaseNote(admin: Admin, caseId: string, adminId: string, body: string) {
  await admin.from("resolution_messages").insert({
    case_id: caseId,
    sender_id: adminId,
    sender_role: "admin",
    body,
  });
}

// ---------------------------------------------------------------------------
// Party actions — thin wrappers over lib/resolutions/core.ts, which the
// mechanic app's route handlers share (Task 69). The caller, and whether they
// are staff, comes from the session COOKIE here and is deliberately not an
// argument: every export of a "use server" file is browser-reachable.
// ---------------------------------------------------------------------------

export type { OpenCaseInput } from "@/lib/resolutions/core";

export async function openResolutionCase(input: OpenCaseInput): Promise<ResolutionResult> {
  const guard = await requireStaff();
  if (!guard.ok) return guard;
  const result = await openResolutionCaseFor(input, guard);
  return result.ok ? result : { ok: false, error: result.error };
}

export async function postResolutionMessage(caseId: string, body: string): Promise<SimpleResult> {
  const guard = await requireStaff();
  if (!guard.ok) return guard;
  const result = await postResolutionMessageFor(caseId, body, guard);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function updateResolutionStatus(
  caseId: string,
  status: ResolutionStatus,
  note?: string,
): Promise<SimpleResult> {
  const guard = await requireStaff();
  if (!guard.ok) return guard;
  const result = await updateResolutionStatusFor(caseId, status, note, guard);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

// ---------------------------------------------------------------------------
// Redistribute — admin re-broadcasts the job to other eligible mechanics.
// Mirrors the re-dispatch in app/actions/mechanic-jobs.ts (cancel + rebroadcast).
// ---------------------------------------------------------------------------

export async function redistributeFromCase(caseId: string, note?: string): Promise<SimpleResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const { data: kase } = await admin
    .from("resolution_cases")
    .select("id, booking_id, mechanic_id, redistributed")
    .eq("id", caseId)
    .maybeSingle();
  if (!kase) return { ok: false, error: "That case no longer exists." };

  const { data: booking } = await admin
    .from("bookings")
    .select("id, status, mechanic_id")
    .eq("id", kase.booking_id)
    .maybeSingle();
  if (!booking) return { ok: false, error: "That job no longer exists." };
  if (booking.status === "completed" || booking.status === "cancelled")
    return { ok: false, error: `Can't redistribute a ${booking.status} job.` };

  const reason = note?.trim() || "Redistributed from a resolution case.";

  const { error } = await admin
    .from("bookings")
    .update({
      mechanic_id: null,
      status: "sourcing_mechanic",
      cancellation_reason: reason,
      reschedule_proposed_at: null,
      reschedule_note: null,
      reschedule_status: null,
    })
    .eq("id", booking.id);
  if (error) return { ok: false, error: error.message };

  await admin.from("booking_events").insert({
    booking_id: booking.id,
    event_type: "resolution_redistributed",
    actor_id: guard.userId,
    actor_role: "admin",
    reason,
    payload: {
      case_id: caseId,
      previous_mechanic_id: booking.mechanic_id,
      status_from: booking.status,
      status_to: "sourcing_mechanic",
    },
  });

  await admin
    .from("resolution_cases")
    .update({ redistributed: true, status: "in_progress", updated_at: new Date().toISOString() })
    .eq("id", caseId);

  await logCaseNote(admin, caseId, guard.userId, `↻ Redistributed the job for re-broadcast. ${reason}`);

  // A dispatch hiccup must not fail the redistribute — admin can hand-assign.
  try {
    await dispatchBooking(booking.id);
  } catch (err) {
    console.error("Re-dispatch failed after resolution redistribute", booking.id, err);
  }

  revalidatePath(`/admin/resolutions/${caseId}`);
  revalidatePath("/admin/resolutions");
  revalidatePath(`/admin/jobs/${booking.id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Customer comms — the ONLY customer touch-point. Admin picks a template or
// writes a manual message; email and SMS are each independently optional.
// ---------------------------------------------------------------------------

export interface SendCaseEmailInput {
  caseId: string;
  templateKey?: string;
  manualSubject?: string;
  manualBody?: string;
}

export async function sendCaseCustomerEmail(input: SendCaseEmailInput): Promise<SimpleResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const loaded = await loadCaseBooking(admin, input.caseId);
  if (!loaded) return { ok: false, error: "That case no longer exists." };
  const { booking } = loaded;
  if (!booking.customer_email) return { ok: false, error: "This booking has no customer email." };

  let subject: string;
  let html: string;
  let auditLabel: string;

  if (input.templateKey) {
    try {
      ({ subject, html } = await renderTemplateEmail(input.templateKey, customerVars(booking)));
    } catch {
      return { ok: false, error: "Couldn't render that email template." };
    }
    auditLabel = `template "${input.templateKey}"`;
  } else {
    subject = (input.manualSubject ?? "").trim();
    const bodyText = (input.manualBody ?? "").trim();
    if (!subject || !bodyText)
      return { ok: false, error: "Enter both a subject and a message." };
    // Manual send: wrap the plain text in a minimal HTML shell.
    html = bodyText
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replace(/\n/g, "<br/>").replace(/</g, "&lt;")}</p>`)
      .join("");
    auditLabel = "a manual message";
  }

  await sendEmail({ to: booking.customer_email, subject, html });
  await logCaseNote(
    admin,
    input.caseId,
    guard.userId,
    `✉️ Emailed the customer (${auditLabel}). Subject: "${subject}".`,
  );

  revalidatePath(`/admin/resolutions/${input.caseId}`);
  return { ok: true };
}

export interface SendCaseSmsInput {
  caseId: string;
  templateKey?: string;
  manualBody?: string;
}

export async function sendCaseCustomerSms(input: SendCaseSmsInput): Promise<SimpleResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const loaded = await loadCaseBooking(admin, input.caseId);
  if (!loaded) return { ok: false, error: "That case no longer exists." };
  const { booking } = loaded;
  if (!booking.customer_phone) return { ok: false, error: "This booking has no customer phone." };

  let body: string;
  let auditLabel: string;
  if (input.templateKey) {
    body = await renderSmsTemplate(input.templateKey as SmsTemplateKey, customerVars(booking));
    auditLabel = `template "${input.templateKey}"`;
  } else {
    body = (input.manualBody ?? "").trim();
    auditLabel = "a manual message";
  }
  if (!body) return { ok: false, error: "The message is empty." };

  const sent = await sendSms({ to: booking.customer_phone, body });
  if (!sent)
    return { ok: false, error: "SMS didn't send. Check SMS is enabled and has credits." };

  await logCaseNote(
    admin,
    input.caseId,
    guard.userId,
    `📱 Texted the customer (${auditLabel}): "${body.slice(0, 120)}".`,
  );

  revalidatePath(`/admin/resolutions/${input.caseId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Reason CRUD — admin-configurable list (settings.role service-role writes).
// ---------------------------------------------------------------------------

export interface SaveReasonInput {
  id?: string;
  label: string;
  active: boolean;
  sortOrder: number;
}

export async function saveResolutionReason(input: SaveReasonInput): Promise<SimpleResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const label = input.label.trim();
  if (!label) return { ok: false, error: "Enter a reason label." };

  const admin = createAdminClient();
  const row = {
    label,
    active: input.active,
    sort_order: input.sortOrder,
    updated_at: new Date().toISOString(),
  };
  const { error } = input.id
    ? await admin.from("resolution_reasons").update(row).eq("id", input.id)
    : await admin.from("resolution_reasons").insert(row);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "A reason with that label already exists." };
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/resolutions/reasons");
  revalidatePath("/mechanic/resolutions/new");
  return { ok: true };
}

export async function deleteResolutionReason(id: string): Promise<SimpleResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  // Soft-delete: keep the row (cases reference it) but hide it from the dropdown.
  const { error } = await admin
    .from("resolution_reasons")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/resolutions/reasons");
  revalidatePath("/mechanic/resolutions/new");
  return { ok: true };
}
