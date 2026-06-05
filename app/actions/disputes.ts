"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { siteUrl } from "@/lib/utils";
import {
  isValidReason,
  MIN_DESCRIPTION_CHARS,
  MAX_DISPUTE_PHOTOS,
  REASON_LABELS,
} from "@/lib/disputes/constants";

export type DisputeResult = { ok: true; disputeId: string } | { ok: false; error: string };
export type SimpleResult = { ok: true } | { ok: false; error: string };

type Admin = ReturnType<typeof createAdminClient>;

const CUSTOMER_DISPUTE_WINDOW_MS = 48 * 60 * 60 * 1000;
const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "help@bookmytech.co.uk";

// ---------------------------------------------------------------------------
// Shared guards
// ---------------------------------------------------------------------------

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Please sign in." };
  return { ok: true as const, userId: user.id, email: user.email ?? null };
}

interface DisputeBooking {
  id: string;
  status: string;
  customer_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  mechanic_id: string | null;
  completed_at: string | null;
  total_pence: number | null;
  service: { name: string | null } | { name: string | null }[] | null;
}

const DISPUTE_BOOKING_SELECT =
  "id, status, customer_id, customer_email, customer_name, mechanic_id, completed_at, total_pence, service:services(name)";

function serviceName(b: DisputeBooking): string {
  const s = Array.isArray(b.service) ? b.service[0] : b.service;
  return s?.name ?? "your booking";
}

/** The mechanic's email lives on the auth user, not the profile. */
async function mechanicEmail(admin: Admin, mechanicId: string | null): Promise<string | null> {
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
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export async function uploadDisputePhoto(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const guard = await requireUser();
  if (!guard.ok) return guard;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "No photo selected." };
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, error: "Photo must be 10 MB or smaller." };
  const ext = ALLOWED_PHOTO_TYPES[file.type];
  if (!ext) return { ok: false, error: "Use a JPG, PNG or WebP image." };

  const admin = createAdminClient();
  const path = `disputes/${guard.userId}/${Date.now()}-${Math.round(file.size)}.${ext}`;
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

export async function openDispute(
  bookingId: string,
  input: OpenDisputeInput,
): Promise<DisputeResult> {
  const guard = await requireUser();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select(DISPUTE_BOOKING_SELECT)
    .eq("id", bookingId)
    .single<DisputeBooking>();
  if (!booking) return { ok: false, error: "That booking no longer exists." };

  // Determine the opener's role from their relationship to the booking.
  const isCustomer = booking.customer_id === guard.userId;
  const isMechanic = booking.mechanic_id === guard.userId;
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
      opened_by: guard.userId,
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
    actor_id: guard.userId,
    actor_role: role,
    reason: REASON_LABELS[input.reasonCategory] ?? input.reasonCategory,
    payload: { dispute_id: dispute.id, status_from: booking.status },
  });

  // Hold the mechanic's payout if it was already transferred at completion.
  const held = await holdMechanicPayout(admin, bookingId);
  if (held) await admin.from("disputes").update({ payout_held: true }).eq("id", dispute.id);

  // Notify the admin team + the other party.
  await notifyDisputeOpened(admin, booking, role, dispute.id);

  revalidatePath("/dashboard");
  revalidatePath(`/book/confirmed/${bookingId}`);
  revalidatePath("/admin/disputes");
  if (booking.mechanic_id) revalidatePath(`/mechanic/jobs/${bookingId}`);
  return { ok: true, disputeId: dispute.id };
}

// ---------------------------------------------------------------------------
// Payout hold — reverse the mechanic's transfer while a dispute is open.
// ---------------------------------------------------------------------------

/**
 * If the mechanic was already paid for this booking (a payout_transferred event
 * exists), reverse the Stripe transfer so the funds sit on the platform balance
 * until the dispute resolves. Best-effort + non-fatal: returns true only if a
 * reversal actually happened. The reverse re-transfer / refund happens at
 * resolution (see resolveDispute).
 */
async function holdMechanicPayout(admin: Admin, bookingId: string): Promise<boolean> {
  const { data: ev } = await admin
    .from("booking_events")
    .select("payload")
    .eq("booking_id", bookingId)
    .eq("event_type", "payout_transferred")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const transferId = (ev?.payload as { transfer_id?: string } | null)?.transfer_id;
  if (!transferId) return false;

  let stripe: typeof import("@/lib/stripe/server").stripe | null = null;
  try {
    stripe = (await import("@/lib/stripe/server")).stripe;
  } catch {
    return false;
  }
  try {
    const reversal = await stripe.transfers.createReversal(transferId, {
      metadata: { booking_id: bookingId, reason: "dispute_opened" },
    });
    await admin.from("booking_events").insert({
      booking_id: bookingId,
      event_type: "payout_reversed",
      actor_role: "system",
      reason: "Mechanic payout held pending dispute resolution.",
      payload: { transfer_id: transferId, reversal_id: reversal.id, amount_pence: reversal.amount },
    });
    return true;
  } catch (err) {
    console.error("Failed to reverse payout for booking", bookingId, err);
    return false;
  }
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
  const ref = booking.id.slice(0, 8).toUpperCase();

  // Admin team.
  sendEmail({
    to: ADMIN_EMAIL,
    subject: `New dispute opened — booking ${ref}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color:#1e3a8a;">A dispute has been opened</h1>
        <p>The ${openerRole} opened a dispute on <strong>${svc}</strong> (ref ${ref}).</p>
        <p style="color:#64748b;font-size:14px;">Monitor it and step in only if the parties can't resolve it themselves.</p>
        <p><a href="${siteUrl()}/admin/disputes/${disputeId}">Open the dispute →</a></p>
      </div>`,
  }).catch((e) => console.error("dispute admin email failed", e));

  // The other party.
  if (openerRole === "customer") {
    const to = await mechanicEmail(admin, booking.mechanic_id);
    if (to) {
      sendEmail({
        to,
        subject: `A customer raised an issue — booking ${ref}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color:#1e3a8a;">A customer raised an issue</h1>
            <p>The customer on <strong>${svc}</strong> (ref ${ref}) has opened a dispute. Please add your account so we can resolve it quickly.</p>
            <p><a href="${siteUrl()}/mechanic/disputes/${disputeId}">Respond to the dispute →</a></p>
            <p style="color:#64748b;font-size:14px;">Your payout for this job is paused until the dispute is resolved.</p>
          </div>`,
      }).catch((e) => console.error("dispute mechanic email failed", e));
    }
  } else if (booking.customer_email) {
    sendEmail({
      to: booking.customer_email,
      subject: `Your mechanic raised an issue — booking ${ref}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color:#1e3a8a;">Your mechanic raised an issue</h1>
          <p>Hi ${booking.customer_name ?? "there"},</p>
          <p>Your mechanic has opened a dispute on <strong>${svc}</strong> (ref ${ref}). Please respond so we can sort it out.</p>
          <p><a href="${siteUrl()}/dashboard/disputes/${disputeId}">View the dispute →</a></p>
        </div>`,
    }).catch((e) => console.error("dispute customer email failed", e));
  }
}

// ---------------------------------------------------------------------------
// Party access to a dispute (customer / mechanic / admin mediator)
// ---------------------------------------------------------------------------

interface DisputeRow {
  id: string;
  booking_id: string;
  opened_by: string | null;
  opened_by_role: "customer" | "mechanic";
  status: string;
  payout_held: boolean;
}

async function partyForDispute(disputeId: string) {
  const guard = await requireUser();
  if (!guard.ok) return guard;

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
    .eq("id", guard.userId)
    .single();

  let role: "customer" | "mechanic" | "admin" | null = null;
  if (profile?.role === "admin") role = "admin";
  else if (booking.customer_id === guard.userId) role = "customer";
  else if (booking.mechanic_id === guard.userId) role = "mechanic";
  if (!role) return { ok: false as const, error: "You're not a party to this dispute." };

  return { ok: true as const, admin, dispute, booking, userId: guard.userId, role };
}

function revalidateDispute(disputeId: string, bookingId: string) {
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

export async function sendDisputeMessage(disputeId: string, body: string): Promise<SimpleResult> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Type a message first." };

  const party = await partyForDispute(disputeId);
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
    sendEmail({
      to: ADMIN_EMAIL,
      subject: `Dispute responded — booking ${booking.id.slice(0, 8).toUpperCase()}`,
      html: `<p>The ${role} responded to the dispute on ${serviceName(booking)}. <a href="${siteUrl()}/admin/disputes/${disputeId}">Review →</a></p>`,
    }).catch(() => {});
  }

  revalidateDispute(disputeId, dispute.booking_id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Opener withdraws (satisfied / sorted) — closes with no refund and releases
// the mechanic's held payout. Money-bearing outcomes go through admin (Step 4).
// ---------------------------------------------------------------------------

export async function withdrawDispute(disputeId: string): Promise<SimpleResult> {
  const party = await partyForDispute(disputeId);
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

  // Release the mechanic's payout if it was held.
  if (dispute.payout_held) await releaseMechanicPayout(admin, booking);

  // Notify both parties.
  const ref = booking.id.slice(0, 8).toUpperCase();
  if (booking.customer_email)
    sendEmail({
      to: booking.customer_email,
      subject: `Dispute closed — booking ${ref}`,
      html: `<p>The dispute on ${serviceName(booking)} has been withdrawn and closed. No further action is needed.</p>`,
    }).catch(() => {});
  const mechTo = await mechanicEmail(admin, booking.mechanic_id);
  if (mechTo)
    sendEmail({
      to: mechTo,
      subject: `Dispute closed — booking ${ref}`,
      html: `<p>The dispute on ${serviceName(booking)} has been withdrawn. Your payout for this job has been released.</p>`,
    }).catch(() => {});

  revalidateDispute(disputeId, dispute.booking_id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Escalate to the admin mediator (manual; the cron does it automatically at 48h).
// ---------------------------------------------------------------------------

export async function escalateDispute(disputeId: string): Promise<SimpleResult> {
  const party = await partyForDispute(disputeId);
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
  sendEmail({
    to: ADMIN_EMAIL,
    subject: `Dispute escalated — booking ${booking.id.slice(0, 8).toUpperCase()}`,
    html: `<p>A dispute on ${serviceName(booking)} was escalated by the ${role} and needs arbitration. <a href="${siteUrl()}/admin/disputes/${disputeId}">Arbitrate →</a></p>`,
  }).catch(() => {});

  revalidateDispute(disputeId, dispute.booking_id);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Re-pay the mechanic after a held payout is released (withdraw / found in their
// favour). We reversed the original transfer on open, so create a fresh one.
// ---------------------------------------------------------------------------

export async function releaseMechanicPayout(admin: Admin, booking: DisputeBooking): Promise<boolean> {
  const { data: mech } = await admin
    .from("mechanics")
    .select("stripe_account_id")
    .eq("id", booking.mechanic_id ?? "")
    .maybeSingle();
  const { data: full } = await admin
    .from("bookings")
    .select("mechanic_payout_pence")
    .eq("id", booking.id)
    .single();
  const payoutPence = full?.mechanic_payout_pence ?? 0;
  if (!mech?.stripe_account_id || payoutPence <= 0) return false;

  let stripe: typeof import("@/lib/stripe/server").stripe | null = null;
  try {
    stripe = (await import("@/lib/stripe/server")).stripe;
  } catch {
    return false;
  }
  try {
    const transfer = await stripe.transfers.create({
      amount: payoutPence,
      currency: "gbp",
      destination: mech.stripe_account_id,
      transfer_group: booking.id,
      metadata: { booking_id: booking.id, reason: "dispute_released" },
    });
    await admin.from("booking_events").insert({
      booking_id: booking.id,
      event_type: "payout_transferred",
      actor_role: "system",
      reason: "Payout released after dispute resolution.",
      payload: { amount_pence: payoutPence, transfer_id: transfer.id },
    });
    await admin.from("disputes").update({ payout_held: false }).eq("booking_id", booking.id);
    return true;
  } catch (err) {
    console.error("Failed to release payout for booking", booking.id, err);
    return false;
  }
}
