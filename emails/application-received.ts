import "server-only";
import { layout } from "./_layout";
import { renderEmail, escapeHtml } from "./render";
import type { RenderedEmail } from "./mechanic-invite";

export interface ApplicationReceivedInput {
  /** Applicant's display name for the greeting. */
  name: string;
}

// Sent to a prospective mechanic the moment they submit their application.
// Sets the 48-hour review expectation from the brief.
export async function renderApplicationReceivedEmail({
  name,
}: ApplicationReceivedInput): Promise<RenderedEmail> {
  const safeName = escapeHtml(name);

  const mjml = layout({
    preheader: "We've received your application — we'll review it within 48 hours.",
    content: `
      <mj-section background-color="#FFFFFF" padding="8px 24px 0">
        <mj-column>
          <mj-text font-size="24px" font-weight="800" line-height="1.3" color="#0F172A">
            Thanks, ${safeName} — we've got your application.
          </mj-text>
          <mj-text>
            Your application to join Book My Tech as a vetted professional has
            been received. Our team will review your details and documents and
            get back to you <strong>within 48 hours</strong>.
          </mj-text>
          <mj-text>
            There's nothing more you need to do right now. If we need anything
            else to complete your application, we'll email you with a link to
            supply it.
          </mj-text>
          <mj-text color="#64748B" font-size="12px" padding-top="8px">
            Didn't apply? You can safely ignore this email.
          </mj-text>
        </mj-column>
      </mj-section>
    `,
  });

  return {
    subject: "We've received your Book My Tech application",
    html: await renderEmail(mjml),
  };
}
