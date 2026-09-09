import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { sendSms } from "@/lib/sms/send-sms";
import { renderSmsTemplate } from "@/lib/sms/render-template";
import { sendPushToCustomer } from "@/lib/push/send";
import { mechanicEmail, mechanicPhone } from "@/lib/bookings/manage-booking";
import { formatJobNumber, formatPrice, siteUrl } from "@/lib/utils";
import { customerDirectionSentence, diffRevision, differenceLabel, packDiff } from "./diff";
import type { RevisionView } from "./load";

// Every notification a revision sends (Task 37), in one place. All
// fire-and-forget: a failed email must never fail the action that sent it.

export interface RevisionBookingContact {
  id: string;
  job_number: number | null;
  customer_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  mechanic_id: string | null;
}

export function revisionUrl(revisionId: string): string {
  return `${siteUrl()}/dashboard/revisions/${revisionId}`;
}

export async function notifyCustomerRevisionSent(booking: RevisionBookingContact, revision: RevisionView): Promise<void> {
  const admin = createAdminClient();
  const { data: mech } = booking.mechanic_id
    ? await admin.from("profiles").select("full_name").eq("id", booking.mechanic_id).maybeSingle()
    : { data: null };
  const mechanic = mech?.full_name ?? "Your mechanic";
  const ref = formatJobNumber(booking.job_number);
  const url = revisionUrl(revision.id);
  const diff = diffRevision(revision.before, revision.after);
  const packed = packDiff(diff);
  const difference = differenceLabel(revision.differencePence);
  const expires = revision.expiresAt
    ? new Date(revision.expiresAt).toLocaleString("en-GB", { weekday: "long", hour: "numeric", minute: "2-digit", timeZone: "Europe/London" })
    : "";

  if (booking.customer_email) {
    const to = booking.customer_email;
    renderTemplateEmail("revision_sent", {
      name: booking.customer_name ?? "there",
      ref,
      mechanic,
      reason: revision.reason,
      before_total: formatPrice(revision.before.totalPence),
      after_total: formatPrice(revision.after.totalPence),
      difference,
      difference_line: customerDirectionSentence(revision.differencePence),
      removed_lines: packed.removed,
      added_lines: packed.added,
      kept_lines: packed.kept,
      optional_note: revision.note ? `Note from your mechanic: "${revision.note}"` : "",
      url,
      expires,
    })
      .then(({ subject, html }) => sendEmail({ to, subject, html }))
      .catch(console.error);
  }
  if (booking.customer_phone) {
    const phone = booking.customer_phone;
    renderSmsTemplate("revision_sent", { after_total: formatPrice(revision.after.totalPence), difference, url })
      .then((body) => sendSms({ to: phone, body }))
      .catch(() => {});
  }
  sendPushToCustomer(booking.customer_id, {
    title: "Your mechanic has revised the job",
    body: `${revision.after.repairDescription} — ${formatPrice(revision.after.totalPence)} (${difference}). Tap to review.`,
    bookingId: booking.id,
  }).catch(() => {});
}

export async function notifyMechanicRevisionOutcome(
  booking: RevisionBookingContact,
  revision: RevisionView,
  outcome: "approved" | "declined" | "expired",
): Promise<void> {
  const admin = createAdminClient();
  const ref = formatJobNumber(booking.job_number);
  const vars = {
    ref,
    after_total: formatPrice(revision.after.totalPence),
    difference: differenceLabel(revision.differencePence),
    job: revision.after.repairDescription,
  };
  const email = await mechanicEmail(admin, booking.mechanic_id);
  if (email) {
    renderTemplateEmail(`revision_${outcome}_mechanic`, vars)
      .then(({ subject, html }) => sendEmail({ to: email, subject, html }))
      .catch(console.error);
  }
  if (outcome !== "expired") {
    const phone = await mechanicPhone(admin, booking.mechanic_id);
    if (phone) {
      renderSmsTemplate(outcome === "approved" ? "mech_revision_approved" : "mech_revision_declined", vars)
        .then((body) => sendSms({ to: phone, body }))
        .catch(() => {});
    }
  }
}

export async function notifyCustomerJobEndedOnSite(
  booking: RevisionBookingContact,
  args: { feePence: number; feeLabel: string; reason: string },
): Promise<void> {
  const ref = formatJobNumber(booking.job_number);
  const feeLine =
    args.feePence > 0
      ? `${args.feeLabel}: ${formatPrice(args.feePence)} has been charged to your card. The rest of your pre-authorisation has been released.`
      : "Nothing has been charged — your whole pre-authorisation has been released.";
  if (booking.customer_email) {
    const to = booking.customer_email;
    renderTemplateEmail("job_ended_on_site", {
      name: booking.customer_name ?? "there",
      ref,
      reason: args.reason,
      fee_line: feeLine,
      url: `${siteUrl()}/dashboard`,
    })
      .then(({ subject, html }) => sendEmail({ to, subject, html }))
      .catch(console.error);
  }
  if (booking.customer_phone) {
    const phone = booking.customer_phone;
    renderSmsTemplate("job_ended_on_site", { ref, fee_line: args.feePence > 0 ? `${formatPrice(args.feePence)} charged, the rest released.` : "Nothing charged." })
      .then((body) => sendSms({ to: phone, body }))
      .catch(() => {});
  }
}
