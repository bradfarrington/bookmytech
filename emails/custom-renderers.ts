import "server-only";
import { escapeHtml } from "./render";
import type { MergeVars } from "./blocks";

// Code-side renderers for the dynamic, non-editable parts of an email (amber
// panels, itemised lists, summary tables). A `custom` block in the registry
// names one of these by key. Each returns MJML valid INSIDE an <mj-column> —
// i.e. mj-text / mj-button / mj-table level, never its own <mj-section>.

export type CustomRenderer = (vars: MergeVars) => string;

/** Split a "a|b|c" packed list var into trimmed, non-empty items. */
function packedList(value: unknown): string[] {
  if (value == null) return [];
  return String(value)
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

export const CUSTOM_RENDERERS: Record<string, CustomRenderer> = {
  // application_approved — amber "outstanding items" block, only when the
  // mechanic was approved with grace (grace_outstanding populated).
  grace_block(vars) {
    const items = packedList(vars.grace_outstanding);
    if (items.length === 0) return "";
    const endsOn = escapeHtml(String(vars.grace_ends_on ?? ""));
    return `
      <mj-text padding-top="8px" color="#92400E" font-size="13px">
        <strong>You're live, with a few items to finish.</strong> Please supply
        the following by <strong>${endsOn}</strong> to keep receiving jobs:
      </mj-text>
      <mj-text color="#92400E" font-size="13px" padding-top="0">
        ${items.map((o) => `&bull; ${escapeHtml(o)}`).join("<br />")}
      </mj-text>`;
  },

  // grace_period_reminder — amber list of the still-outstanding documents.
  outstanding_list(vars) {
    const items = packedList(vars.outstanding);
    if (items.length === 0) return "";
    return `<mj-text color="#92400E" font-size="13px" padding-top="0">
      ${items.map((o) => `&bull; ${escapeHtml(o)}`).join("<br />")}
    </mj-text>`;
  },

  // low_sms_credits — the amber balance panel.
  low_credit_balance(vars) {
    const balance = escapeHtml(String(vars.balance ?? "0"));
    return `<mj-text align="center" padding="8px 0">
      <div style="background:#FEF3C7;border-radius:8px;padding:20px;text-align:center;">
        <div style="font-size:40px;font-weight:800;color:#B45309;line-height:1;">${balance}</div>
        <div style="font-size:12px;font-weight:700;color:#92400E;letter-spacing:1px;margin-top:4px;">CREDITS REMAINING</div>
      </div>
    </mj-text>`;
  },

  // dispute_resolved_customer — optional refund / credit lines.
  resolution_amounts(vars) {
    const parts: string[] = [];
    if (vars.refund_line)
      parts.push(`<mj-text padding-top="4px">${escapeHtml(String(vars.refund_line))}</mj-text>`);
    if (vars.credit_line)
      parts.push(`<mj-text padding-top="4px">${escapeHtml(String(vars.credit_line))}</mj-text>`);
    return parts.join("\n");
  },

  // dispatch_stall_alert — packed "ref · service · area · value" rows.
  stall_list(vars) {
    const items = packedList(vars.bookings);
    if (items.length === 0) return "";
    return `<mj-text padding-top="4px">${items
      .map((i) => `&bull; ${escapeHtml(i)}`)
      .join("<br />")}</mj-text>`;
  },

  // Generic optional muted line — renders only when the `optional_note` var is set.
  optional_note(vars) {
    const line = vars.optional_note ? String(vars.optional_note) : "";
    if (!line) return "";
    return `<mj-text color="#64748B" font-size="14px" padding-top="4px">${escapeHtml(line)}</mj-text>`;
  },

  // job_complete — optional muted "service total · credit" line, only when credit applied.
  receipt_credit(vars) {
    const line = vars.credit_line ? String(vars.credit_line) : "";
    if (!line) return "";
    return `<mj-text color="#64748B" font-size="13px" padding-top="4px">${escapeHtml(line)}</mj-text>`;
  },

  // job_complete — one-tap star rating widget + leave-a-review link.
  review_stars(vars) {
    const url = escapeHtml(String(vars.review_url ?? "#"));
    const stars = [1, 2, 3, 4, 5]
      .map(
        (n) =>
          `<a href="${url}?rating=${n}" style="text-decoration:none;font-size:28px;color:#F59E0B;">&#9733;</a>`,
      )
      .join("&nbsp;");
    return `<mj-text align="center" padding="8px 0">
      <div style="margin:8px 0;padding:20px;background:#F8FAFC;border-radius:12px;text-align:center;">
        <div style="font-weight:600;color:#0F172A;margin-bottom:8px;">How did your mechanic do?</div>
        <div style="margin-bottom:12px;">${stars}</div>
        <a href="${url}" style="color:#2563EB;font-weight:600;">Leave a review</a>
      </div>
    </mj-text>`;
  },

  // booking summary card (ref · service · vehicle · when) used by booking emails.
  booking_summary(vars) {
    const rows: [string, unknown][] = [
      ["Booking ref", vars.ref],
      ["Service", vars.service],
      ["Vehicle", vars.vehicle],
      ["When", vars.when],
    ];
    const cells = rows
      .filter(([, v]) => v != null && String(v).length > 0)
      .map(
        ([label, v]) =>
          `<tr><td style="padding:6px 0;color:#64748B;font-size:13px;">${escapeHtml(
            label,
          )}</td><td style="padding:6px 0;font-weight:600;text-align:right;">${escapeHtml(
            String(v),
          )}</td></tr>`,
      )
      .join("");
    return `<mj-text padding="8px 0">
      <table style="width:100%;border-collapse:collapse;background:#F8FAFC;border-radius:8px;padding:4px 12px;">
        ${cells}
      </table>
    </mj-text>`;
  },
};
