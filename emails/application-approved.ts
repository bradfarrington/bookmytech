import "server-only";
import { layout } from "./_layout";
import { renderEmail, escapeHtml } from "./render";
import type { RenderedEmail } from "./mechanic-invite";

export interface ApplicationApprovedInput {
  name: string;
  /** token_hash magic-link into /auth/callback (same flow as the invite). */
  actionLink: string;
  /** If approved with grace, the deadline + outstanding items copy. */
  grace?: { endsOn: string; outstanding: string[] } | null;
}

// Sent when an application is approved. Reuses the proven magic-link sign-in
// flow rather than a temp password (no reset screen needed).
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
            Your application has been approved. Click below to sign in, set your
            password and start receiving jobs near you.
          </mj-text>
          <mj-button href="${safeLink}" align="left" padding="20px 0 8px">
            Sign in to your dashboard
          </mj-button>
          ${graceBlock}
          <mj-text color="#64748B" font-size="12px" padding-top="16px">
            This link expires in 24 hours.
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
