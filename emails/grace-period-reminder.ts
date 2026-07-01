import "server-only";
import { layout } from "./_layout";
import { renderEmail, escapeHtml } from "./render";
import type { RenderedEmail } from "./mechanic-invite";

export interface GracePeriodReminderInput {
  name: string;
  /** Days left before the grace deadline (1 = last day). */
  daysRemaining: number;
  /** Human-readable deadline, e.g. "5 August 2026". */
  endsOn: string;
  /** Outstanding document labels still to supply. */
  outstanding: string[];
  /** Absolute URL to the mechanic documents page. */
  documentsLink: string;
}

// Sent by the grace-enforcement cron at 14 / 7 / 1 days before an
// approved-with-grace mechanic's deadline, while documents are still missing.
export async function renderGracePeriodReminderEmail({
  name,
  daysRemaining,
  endsOn,
  outstanding,
  documentsLink,
}: GracePeriodReminderInput): Promise<RenderedEmail> {
  const safeName = escapeHtml(name);
  const safeLink = escapeHtml(documentsLink);
  const safeEnds = escapeHtml(endsOn);
  const dayLine =
    daysRemaining <= 1 ? "just 1 day left" : `${daysRemaining} days left`;

  const list = outstanding.length
    ? `<mj-text color="#92400E" font-size="13px" padding-top="0">
         ${outstanding.map((o) => `&bull; ${escapeHtml(o)}`).join("<br />")}
       </mj-text>`
    : "";

  const headline = `${dayLine} to upload your documents`;

  const mjml = layout({
    preheader: headline,
    content: `
      <mj-section background-color="#FFFFFF" padding="8px 24px 0">
        <mj-column>
          <mj-text font-size="22px" font-weight="800" line-height="1.3" color="#0F172A">
            ${safeName}, ${dayLine} to finish your paperwork
          </mj-text>
          <mj-text>
            You were approved with a 28-day window to supply your outstanding
            documents. Please upload them by <strong>${safeEnds}</strong> — after
            that your account is paused and you'll stop receiving new jobs until
            they're on file.
          </mj-text>
          <mj-text color="#92400E" font-size="13px" padding-top="8px">
            <strong>Still needed:</strong>
          </mj-text>
          ${list}
          <mj-button href="${safeLink}" align="left" padding="20px 0 8px">
            Upload documents
          </mj-button>
        </mj-column>
      </mj-section>
    `,
  });

  return {
    subject: headline,
    html: await renderEmail(mjml),
  };
}
