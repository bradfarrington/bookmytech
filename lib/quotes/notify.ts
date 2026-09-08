import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { sendSms } from "@/lib/sms/send-sms";
import { renderSmsTemplate } from "@/lib/sms/render-template";
import { sendPushToCustomer } from "@/lib/push/send";
import { mechanicEmail, mechanicPhone } from "@/lib/bookings/manage-booking";
import { formatJobNumber, formatPrice, siteUrl } from "@/lib/utils";
import { QUOTE_KIND_LABEL } from "./status";
import type { QuoteView } from "./load";

// Every notification a quote sends (Task 33), in one place. All fire-and-forget:
// a failed email must never fail the action that sent it.

export interface QuoteBookingContact {
  id: string;
  job_number: number | null;
  customer_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  mechanic_id: string | null;
}

/** "Renew the rear brake pads · 0.8 h × £60|Rear brake pads × 1 · £32.00" for the email's packed-list renderer. */
export function packQuoteLines(quote: QuoteView): string {
  return quote.lines
    .map((l) =>
      l.kind === "labour"
        ? `${l.description} · ${l.hours ?? 0} h × ${formatPrice(l.unitPence)} = ${formatPrice(l.linePence)}`
        : `${l.description}${l.quantity > 1 ? ` × ${l.quantity}` : ""} · ${formatPrice(l.linePence)}`,
    )
    .join("|");
}

export function quoteUrl(quoteId: string): string {
  return `${siteUrl()}/dashboard/quotes/${quoteId}`;
}

export async function notifyCustomerQuoteSent(booking: QuoteBookingContact, quote: QuoteView): Promise<void> {
  const admin = createAdminClient();
  const { data: mech } = booking.mechanic_id
    ? await admin.from("profiles").select("full_name").eq("id", booking.mechanic_id).maybeSingle()
    : { data: null };
  const mechanic = mech?.full_name ?? "Your mechanic";
  const total = formatPrice(quote.totalPence);
  const ref = formatJobNumber(booking.job_number);
  const url = quoteUrl(quote.id);
  const expires = quote.expiresAt
    ? new Date(quote.expiresAt).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" })
    : "";

  if (booking.customer_email) {
    const to = booking.customer_email;
    renderTemplateEmail("quote_sent", {
      name: booking.customer_name ?? "there",
      ref,
      mechanic,
      total,
      kind_line: quote.kind === "follow_on" ? "a return visit" : "extra work on your current job",
      quote_lines: packQuoteLines(quote),
      optional_note: quote.note ? `Note from your mechanic: "${quote.note}"` : "",
      url,
      expires,
    })
      .then(({ subject, html }) => sendEmail({ to, subject, html }))
      .catch(console.error);
  }
  if (booking.customer_phone) {
    const phone = booking.customer_phone;
    renderSmsTemplate("quote_sent", { total, url })
      .then((body) => sendSms({ to: phone, body }))
      .catch(() => {});
  }
  sendPushToCustomer(booking.customer_id, {
    title: "Your mechanic has sent a quote",
    body: `${total} for ${quote.kind === "follow_on" ? "a return visit" : "extra work"} — tap to review.`,
    bookingId: booking.id,
  }).catch(() => {});
}

export async function notifyMechanicQuoteOutcome(
  booking: QuoteBookingContact,
  quote: QuoteView,
  outcome: "approved" | "declined" | "expired",
): Promise<void> {
  const admin = createAdminClient();
  const ref = formatJobNumber(booking.job_number);
  const total = formatPrice(quote.totalPence);
  const kind = QUOTE_KIND_LABEL[quote.kind] ?? quote.kind;
  const email = await mechanicEmail(admin, booking.mechanic_id);
  if (email) {
    renderTemplateEmail(`quote_${outcome}_mechanic`, { ref, total, kind_line: kind.toLowerCase() })
      .then(({ subject, html }) => sendEmail({ to: email, subject, html }))
      .catch(console.error);
  }
  if (outcome !== "expired") {
    const phone = await mechanicPhone(admin, booking.mechanic_id);
    if (phone) {
      renderSmsTemplate(outcome === "approved" ? "mech_quote_approved" : "mech_quote_declined", { ref, total })
        .then((body) => sendSms({ to: phone, body }))
        .catch(() => {});
    }
  }
}

export async function notifyCustomerPriceReduced(
  booking: QuoteBookingContact,
  amountPence: number,
  reason: string | null,
  newTotalPence: number,
): Promise<void> {
  const ref = formatJobNumber(booking.job_number);
  const amount = formatPrice(amountPence);
  if (booking.customer_email) {
    const to = booking.customer_email;
    renderTemplateEmail("price_reduced", {
      name: booking.customer_name ?? "there",
      ref,
      amount,
      new_total: formatPrice(newTotalPence),
      optional_note: reason ? `Your mechanic's note: "${reason}"` : "",
    })
      .then(({ subject, html }) => sendEmail({ to, subject, html }))
      .catch(console.error);
  }
  if (booking.customer_phone) {
    const phone = booking.customer_phone;
    renderSmsTemplate("price_reduced", { amount, ref })
      .then((body) => sendSms({ to: phone, body }))
      .catch(() => {});
  }
}
