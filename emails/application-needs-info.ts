import "server-only";
import { layout } from "./_layout";
import { renderEmail, escapeHtml } from "./render";
import type { RenderedEmail } from "./mechanic-invite";

export interface ApplicationNeedsInfoInput {
  name: string;
  note: string;
  /** Public resubmit link keyed by the application's resubmit_token. */
  resubmitLink: string;
}

export async function renderApplicationNeedsInfoEmail({
  name,
  note,
  resubmitLink,
}: ApplicationNeedsInfoInput): Promise<RenderedEmail> {
  const safeName = escapeHtml(name);
  const safeNote = escapeHtml(note);
  const safeLink = escapeHtml(resubmitLink);

  const mjml = layout({
    preheader: "We need a little more to finish reviewing your application.",
    content: `
      <mj-section background-color="#FFFFFF" padding="8px 24px 0">
        <mj-column>
          <mj-text font-size="22px" font-weight="800" line-height="1.3" color="#0F172A">
            We need a bit more, ${safeName}
          </mj-text>
          <mj-text>
            We're almost there with your application — we just need the
            following before we can finish our review:
          </mj-text>
          <mj-text color="#475569">
            ${safeNote}
          </mj-text>
          <mj-button href="${safeLink}" align="left" padding="20px 0 8px">
            Supply what's needed
          </mj-button>
          <mj-text color="#64748B" font-size="12px" padding-top="16px">
            This is a secure link unique to your application — don't share it.
          </mj-text>
        </mj-column>
      </mj-section>
    `,
  });

  return {
    subject: "Action needed on your Book My Tech application",
    html: await renderEmail(mjml),
  };
}
