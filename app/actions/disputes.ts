"use server";

import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { siteUrl, formatPrice, formatJobNumber } from "@/lib/utils";
import { RESOLUTION_LABELS, type ResolutionKind } from "@/lib/disputes/constants";
import { grantCredit } from "@/lib/credits/credits";
import { refundPayment } from "@/lib/stripe/refund";
import { applySuspension } from "@/lib/mechanics/suspend";
import {
  mechanicEmail,
  openDisputeFor,
  partyForDispute,
  releaseMechanicPayout,
  revalidateDispute,
  sendDisputeMessageFor,
  serviceName,
  uploadDisputePhotoFor,
  withdrawDisputeFor,
  type OpenDisputeInput,
  type DisputeResult,
  type SimpleResult,
} from "@/lib/disputes/core";

// The WEBSITE's entry points into the dispute lifecycle. The party-facing four
// are thin wrappers whose only job is to answer "who is acting?" from the
// session COOKIE and hand that to lib/disputes/core.ts, which holds the logic
// and is shared with the mobile route handlers (app/api/mobile/v1/disputes/**,
// app/api/mobile/v1/bookings/[id]/disputes).
//
// The caller is deliberately NOT a parameter of these functions. Every export of
// a "use server" file is a public endpoint the browser can call with arguments
// of its choosing, so a `callerId` argument here would let anyone dispute,
// withdraw or post into anyone else's case in their name. Mobile threads its
// caller through explicitly because it resolves that caller from a verified
// Bearer token in a route handler, where nothing is client-supplied either.
//
// `escalateDispute` and `resolveDispute` stay here whole: escalation is a party
// action the website and the 48-hour cron drive, and arbitration is admin-only.
// The customer app is deliberately not given either.

export type { OpenDisputeInput, DisputeResult, SimpleResult } from "@/lib/disputes/core";

export interface ResolveDisputeInput {
  resolution: ResolutionKind;
  /** Partial-refund amount (ignored for full/no refund). */
  refundPence?: number;
  /** Compensation credit to the customer (any resolution). */
  creditPence?: number;
  /** Customer-facing explanation (required). */
  note: string;
  /** Flag the mechanic's account (a dispute_loss performance flag). */
  flagMechanic?: boolean;
}

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "help@bookmytech.co.uk";

/**
 * `getUser()` rather than `getSession()`: it verifies the JWT with Supabase
 * instead of trusting the cookie's claims, which is what you want before
 * reversing a mechanic's payout.
 */
async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Please sign in." };
  return { ok: true as const, userId: user.id, email: user.email ?? null };
}

// ---------------------------------------------------------------------------
// Party actions — thin wrappers over the shared core.
// ---------------------------------------------------------------------------

export async function uploadDisputePhoto(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const guard = await requireUser();
  if (!guard.ok) return guard;

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No photo selected." };
  return uploadDisputePhotoFor(file, guard.userId);
}

export async function openDispute(
  bookingId: string,
  input: OpenDisputeInput,
): Promise<DisputeResult> {
  const guard = await requireUser();
  if (!guard.ok) return guard;
  return openDisputeFor(bookingId, input, guard.userId);
}

export async function sendDisputeMessage(disputeId: string, body: string): Promise<SimpleResult> {
  const guard = await requireUser();
  if (!guard.ok) return guard;
  return sendDisputeMessageFor(disputeId, body, guard.userId);
}

export async function withdrawDispute(disputeId: string): Promise<SimpleResult> {
  const guard = await requireUser();
  if (!guard.ok) return guard;
  return withdrawDisputeFor(disputeId, guard.userId);
}

// ---------------------------------------------------------------------------
// Escalate to the admin mediator (manual; the cron does it automatically at 48h).
// ---------------------------------------------------------------------------

export async function escalateDispute(disputeId: string): Promise<SimpleResult> {
  const guard = await requireUser();
  if (!guard.ok) return guard;

  const party = await partyForDispute(disputeId, guard.userId);
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
    const mechTo = await mechanicEmail(admin, booking.mechanic_id);
    if (mechTo)
      renderTemplateEmail("dispute_escalated_mechanic", {
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
// Admin arbitration — the binding decision (Step 4).
// ---------------------------------------------------------------------------

export async function resolveDispute(
  disputeId: string,
  input: ResolveDisputeInput,
): Promise<SimpleResult> {
  const guard = await requireUser();
  if (!guard.ok) return guard;

  const party = await partyForDispute(disputeId, guard.userId);
  if (!party.ok) return party;
  const { admin, dispute, booking, userId, role } = party;
  if (role !== "admin") return { ok: false, error: "Only an admin can arbitrate a dispute." };
  if (["resolved", "withdrawn"].includes(dispute.status))
    return { ok: false, error: "This dispute is already closed." };
  const note = input.note.trim();
  if (!note) return { ok: false, error: "Add a customer-facing explanation for the decision." };

  // Money facts for this booking.
  const { data: money } = await admin
    .from("bookings")
    .select("total_pence, credit_applied_pence, mechanic_payout_pence, stripe_payment_intent_id, customer_id")
    .eq("id", dispute.booking_id)
    .single();
  const chargedPence = Math.max(0, (money?.total_pence ?? 0) - (money?.credit_applied_pence ?? 0));
  const payoutPence = money?.mechanic_payout_pence ?? 0;

  // Resolve the amounts from the chosen outcome.
  let refundPence = 0;
  if (input.resolution === "full_refund") refundPence = chargedPence;
  else if (input.resolution === "partial_refund")
    refundPence = Math.min(Math.max(0, Math.round(input.refundPence ?? 0)), chargedPence);
  const creditPence = Math.max(0, Math.round(input.creditPence ?? 0));

  // 1) Refund the customer's card (if there's a captured charge).
  if (refundPence > 0 && money?.stripe_payment_intent_id) {
    const r = await refundPayment(money.stripe_payment_intent_id, refundPence);
    if (!r.ok) return { ok: false, error: `Refund failed: ${r.error}. Nothing was changed — try again.` };
    await admin.from("booking_events").insert({
      booking_id: dispute.booking_id,
      event_type: "payment_refunded",
      actor_id: userId,
      actor_role: "admin",
      payload: { amount_pence: refundPence, refund_id: r.refundId, dispute_id: disputeId },
    });
  }

  // 2) Compensation credit.
  if (creditPence > 0 && money?.customer_id) {
    await grantCredit(admin, money.customer_id, creditPence, "compensation", `Dispute resolution — booking ${formatJobNumber(booking.job_number)}`);
  }

  // 3) Mechanic payout: refunds come out of the mechanic's share first. If the
  //    payout was held on open, re-transfer what remains; if it was never held
  //    (e.g. uncaptured job) there's nothing to move.
  if (dispute.payout_held) {
    const reTransfer = Math.max(0, payoutPence - refundPence);
    if (reTransfer > 0) await releaseMechanicPayout(admin, booking, reTransfer);
    else await admin.from("disputes").update({ payout_held: false }).eq("id", disputeId);
  }

  // 4) Flag the mechanic on a loss.
  const lostByMechanic = input.flagMechanic || refundPence > 0;
  if (lostByMechanic && booking.mechanic_id) {
    await admin.from("mechanic_flags").insert({
      mechanic_id: booking.mechanic_id,
      flag_type: "dispute_loss",
      severity: input.resolution === "full_refund" ? "high" : "medium",
      related_dispute_id: disputeId,
      notes: `Dispute resolved: ${RESOLUTION_LABELS[input.resolution]}.`,
    });

    // 3+ dispute losses in 30 days → auto-suspend pending review.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("mechanic_flags")
      .select("id", { count: "exact", head: true })
      .eq("mechanic_id", booking.mechanic_id)
      .eq("flag_type", "dispute_loss")
      .gte("created_at", since);
    if ((count ?? 0) >= 3) {
      await applySuspension(
        admin,
        booking.mechanic_id,
        "3 or more disputes lost in 30 days — suspended pending review.",
        null,
        userId,
      );
    }
  }

  // 5) Close the dispute + restore the booking.
  await admin
    .from("disputes")
    .update({
      status: "resolved",
      resolution: input.resolution,
      resolution_refund_pence: refundPence,
      resolution_credit_pence: creditPence,
      resolution_note: note,
      resolved_at: new Date().toISOString(),
      resolved_by: userId,
      resolved_by_role: "admin",
    })
    .eq("id", disputeId);
  await admin.from("bookings").update({ status: "completed" }).eq("id", dispute.booking_id);
  await admin.from("booking_events").insert({
    booking_id: dispute.booking_id,
    event_type: "dispute_resolved",
    actor_id: userId,
    actor_role: "admin",
    reason: RESOLUTION_LABELS[input.resolution],
    payload: { dispute_id: disputeId, resolution: input.resolution, refund_pence: refundPence, credit_pence: creditPence },
  });

  // 6) Tell both parties.
  const ref = formatJobNumber(booking.job_number);
  if (booking.customer_email) {
    const to = booking.customer_email;
    renderTemplateEmail("dispute_resolved_customer", {
      ref,
      note,
      refund_line: refundPence > 0 ? `A refund of ${formatPrice(refundPence)} has been issued to your card.` : "",
      credit_line: creditPence > 0 ? `We've added ${formatPrice(creditPence)} credit to your account.` : "",
    })
      .then(({ subject, html }) => sendEmail({ to, subject, html }))
      .catch(() => {});
  }
  const mechTo = await mechanicEmail(admin, booking.mechanic_id);
  if (mechTo)
    renderTemplateEmail("dispute_resolved_mechanic", {
      ref,
      service: serviceName(booking),
      decision: RESOLUTION_LABELS[input.resolution],
      payout_line:
        refundPence > 0
          ? "A refund was issued to the customer; your payout for this job was adjusted accordingly."
          : "Your payout for this job has been released.",
    })
      .then(({ subject, html }) => sendEmail({ to: mechTo, subject, html }))
      .catch(() => {});

  revalidateDispute(disputeId, dispute.booking_id);
  return { ok: true };
}
