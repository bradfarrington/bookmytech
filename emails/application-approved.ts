import "server-only";
import { layout } from "./_layout";
import { renderEmail, escapeHtml } from "./render";
import type { RenderedEmail } from "./mechanic-invite";

export interface ApplicationApprovedInput {
  name: string;
  /** token_hash recovery link into /auth/callback → /mechanic/set-password. */
  actionLink: string;
  /** If approved with grace, the deadline + outstanding items copy. */
  grace?: { endsOn: string; outstanding: string[] } | null;
}

// Sent when an application is approved. The link is a recovery link that drops
// the mechanic on /mechanic/set-password to choose a password; afterwards they
// sign in with email + password.
export async function renderApplicationApprovedEmail({
  name,
  actionLink,
  grace,
}: ApplicationApprovedInput): Promise<RenderedEmail> {
  const safeName = escapeHtml(name);
  const safeLink = escapeHtml(actionLink);

  const graceBlock = grace
    ? `
      <mj-text padding-top="8px" color="#92400E" font-size="13px">
        <strong>You're live, with a few items to finish.</strong> Please supply
        the following by <strong>${escapeHtml(grace.endsOn)}</strong> to keep
        receiving jobs:
      </mj-text>
      <mj-text color="#92400E" font-size="13px" padding-top="0">
        ${grace.outstanding.map((o) => `&bull; ${escapeHtml(o)}`).join("<br />")}
      </mj-text>`
    : "";

  const mjml = layout({
    preheader: "You're approved — welcome to Book My Tech.",
    content: `
      <mj-section background-color="#FFFFFF" padding="8px 24px 0">
        <mj-column>
          <mj-text font-size="24px" font-weight="800" line-height="1.3" color="#0F172A">
            You're in, ${safeName}. Welcome aboard.
          </mj-text>
          <mj-text>
            Your application has been approved. Click below to set your password
            — then you'll sign in with your email and password to start
            receiving jobs near you.
          </mj-text>
          <mj-button href="${safeLink}" align="left" padding="20px 0 8px">
            Set your password
          </mj-button>
          ${graceBlock}
          <mj-text color="#64748B" font-size="12px" padding-top="16px">
            For your security this link expires soon. If it stops working, ask
            us to send a fresh one.
          </mj-text>
        </mj-column>
      </mj-section>
    `,
  });

  return {
    subject: "You're approved — welcome to Book My Tech",
    html: await renderEmail(mjml),
  };
}
