import "server-only";
import { layout } from "./_layout";
import { renderEmail, escapeHtml } from "./render";
import type { RenderedEmail } from "./mechanic-invite";

export interface AdminNewApplicationInput {
  applicantName: string;
  postcode: string;
  specialismCount: number;
  /** Absolute URL to the approvals queue, deep-linked to this application. */
  reviewLink: string;
}

// Internal alert to ops when a new mechanic application lands. Links straight
// into the approvals queue.
export async function renderAdminNewApplicationEmail({
  applicantName,
  postcode,
  specialismCount,
  reviewLink,
}: AdminNewApplicationInput): Promise<RenderedEmail> {
  const safeName = escapeHtml(applicantName);
  const safePostcode = escapeHtml(postcode);
  const safeLink = escapeHtml(reviewLink);

  const mjml = layout({
    preheader: `New mechanic application from ${applicantName} (${postcode}).`,
    content: `
      <mj-section background-color="#FFFFFF" padding="8px 24px 0">
        <mj-column>
          <mj-text font-size="22px" font-weight="800" line-height="1.3" color="#0F172A">
            New mechanic application
          </mj-text>
          <mj-text>
            <strong>${safeName}</strong> has applied to join the network.
          </mj-text>
          <mj-text color="#475569">
            Postcode: <strong>${safePostcode}</strong><br />
            Specialisms selected: <strong>${specialismCount}</strong>
          </mj-text>
          <mj-button href="${safeLink}" align="left" padding="20px 0 8px">
            Review application
          </mj-button>
          <mj-text color="#64748B" font-size="12px" padding-top="8px">
            Target turnaround is 48 hours from submission.
          </mj-text>
        </mj-column>
      </mj-section>
    `,
  });

  return {
    subject: `New mechanic application — ${applicantName}`,
    html: await renderEmail(mjml),
  };
}
