import "server-only";

import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { sendSms } from "@/lib/sms/send-sms";
import { renderSmsTemplate } from "@/lib/sms/render-template";
import { formatPrice, siteUrl } from "@/lib/utils";
import { describeQuoteVehicle } from "./href";
import type { CustomQuoteRow } from "./model";

// Every notification a custom quote sends (Task 75). All fire-and-forget: a
// failed email must never fail the request, the send or the decline.

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || "support@bookmytech.co.uk";

export const customQuoteUrl = (id: string): string => `${siteUrl()}/book/quote/${id}`;
export const adminCustomQuoteUrl = (id: string): string => `${siteUrl()}/admin/quotes/${id}`;

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || "there";
const vehicleOf = (row: CustomQuoteRow): string => describeQuoteVehicle(row.vehicle_reg, row.vehicle_make, row.vehicle_model);

function send(key: string, to: string, vars: Record<string, string>): void {
  renderTemplateEmail(key, vars)
    .then(({ subject, html }) => sendEmail({ to, subject, html }))
    .catch(console.error);
}

export async function notifyAdminQuoteRequested(row: CustomQuoteRow): Promise<void> {
  send("custom_quote_request_admin", ADMIN_EMAIL, {
    name: row.customer_name,
    reg: row.vehicle_reg,
    vehicle: vehicleOf(row),
    request: row.request_text ?? "",
    contact: [row.customer_email, row.customer_phone, row.postcode].filter(Boolean).join(" · "),
    url: adminCustomQuoteUrl(row.id),
  });
}

export async function notifyCustomerRequestReceived(row: CustomQuoteRow): Promise<void> {
  send("custom_quote_request_received", row.customer_email, {
    name: firstName(row.customer_name),
    reg: row.vehicle_reg,
    request: row.request_text ?? "",
  });
}

export async function notifyCustomerQuoteSent(row: CustomQuoteRow): Promise<void> {
  if (row.total_pence == null) return;
  const total = formatPrice(row.total_pence);
  const url = customQuoteUrl(row.id);
  send("custom_quote_sent", row.customer_email, {
    name: firstName(row.customer_name),
    title: row.title ?? "your job",
    optional_note: row.details ?? "",
    total,
    vehicle: vehicleOf(row),
    url,
  });
  if (row.customer_phone) {
    const phone = row.customer_phone;
    renderSmsTemplate("custom_quote_sent", { total, url })
      .then((body) => sendSms({ to: phone, body }))
      .catch(() => {});
  }
}

export async function notifyAdminQuoteDeclined(row: CustomQuoteRow): Promise<void> {
  send("custom_quote_declined_admin", ADMIN_EMAIL, {
    name: row.customer_name,
    title: row.title ?? row.request_text?.slice(0, 80) ?? "a quote request",
    total: row.total_pence != null ? formatPrice(row.total_pence) : "unpriced",
    url: adminCustomQuoteUrl(row.id),
  });
}
