import "server-only";
import { layout } from "./_layout";
import { renderEmail, escapeHtml } from "./render";
import type { RenderedEmail } from "./mechanic-invite";

export interface ApplicationRejectedInput {
  name: string;
  reason: string;
}

export async function renderApplicationRejectedEmail({
  name,
  reason,
}: ApplicationRejectedInput): Promise<RenderedEmail> {
  const safeName = escapeHtml(name);
  const safeReason = escapeHtml(reason);

  const mjml = layout({
    preheader: "An update on your Book My Tech application.",
    content: `
      <mj-section background-color="#FFFFFF" padding="8px 24px 0">
        <mj-column>
          <mj-text font-size="22px" font-weight="800" line-height="1.3" color="#0F172A">
            An update on your application
          </mj-text>
          <mj-text>
            Hi ${safeName}, thank you for your interest in joining Book My Tech.
            After reviewing your application, we're not able to approve it at
            this time.
          </mj-text>
          <mj-text color="#475569">
            <strong>Reason:</strong> ${safeReason}
          </mj-text>
          <mj-text>
            If you believe this was a mistake or your circumstances change,
            you're welcome to apply again or reply to this email.
          </mj-text>
        </mj-column>
      </mj-section>
    `,
  });

  return {
    subject: "Your Book My Tech application",
    html: await renderEmail(mjml),
  };
}
