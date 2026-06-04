import "server-only";
import { layout } from "./_layout";
import { renderEmail, escapeHtml } from "./render";
import type { RenderedEmail } from "./mechanic-invite";

export interface DocumentExpiryInput {
  name: string;
  docLabel: string;
  /** Days until expiry; 0 = expires today, negative = already expired. */
  daysRemaining: number;
  /** Absolute URL to the mechanic documents page. */
  documentsLink: string;
}

export async function renderDocumentExpiryEmail({
  name,
  docLabel,
  daysRemaining,
  documentsLink,
}: DocumentExpiryInput): Promise<RenderedEmail> {
  const safeName = escapeHtml(name);
  const safeDoc = escapeHtml(docLabel);
  const safeLink = escapeHtml(documentsLink);

  const expired = daysRemaining <= 0;
  const headline = expired
    ? `Your ${safeDoc} has expired`
    : daysRemaining === 0
      ? `Your ${safeDoc} expires today`
      : `Your ${safeDoc} expires in ${daysRemaining} days`;
  const body = expired
    ? `Your ${safeDoc} on file has expired, so you've been taken offline and won't receive new jobs until it's renewed. Upload a current copy to get back online.`
    : `Your ${safeDoc} is due to expire soon. Please upload a renewed copy to avoid any interruption to the jobs you're offered.`;

  const mjml = layout({
    preheader: headline,
    content: `
      <mj-section background-color="#FFFFFF" padding="8px 24px 0">
        <mj-column>
          <mj-text font-size="22px" font-weight="800" line-height="1.3" color="#0F172A">
            ${safeName}, ${headline.charAt(0).toLowerCase()}${headline.slice(1)}
          </mj-text>
          <mj-text>${body}</mj-text>
          <mj-button href="${safeLink}" align="left" padding="20px 0 8px">
            Upload renewed document
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
