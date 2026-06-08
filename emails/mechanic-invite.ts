import "server-only";
import { layout } from "./_layout";
import { renderEmail, escapeHtml } from "./render";

export interface MechanicInviteInput {
  /** Display name shown in the greeting. */
  name: string;
  /** Recovery link from `generateLink({ type: 'recovery' })` → /mechanic/set-password. */
  actionLink: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

export async function renderMechanicInviteEmail({
  name,
  actionLink,
}: MechanicInviteInput): Promise<RenderedEmail> {
  const safeName = escapeHtml(name);
  const safeLink = escapeHtml(actionLink);

  const mjml = layout({
    preheader: "Your Book My Tech mechanic account is ready — sign in to get started.",
    content: `
      <mj-section background-color="#FFFFFF" padding="8px 24px 0">
        <mj-column>
          <mj-text font-size="24px" font-weight="800" line-height="1.3" color="#0F172A">
            Welcome to Book My Tech, ${safeName}.
          </mj-text>
          <mj-text>
            An admin has invited you to join Book My Tech as a vetted professional.
            Click the button below to set your password &mdash; then you'll sign
            in with your email and password to complete your profile.
          </mj-text>
          <mj-button href="${safeLink}" align="left" padding="20px 0 8px">
            Set your password
          </mj-button>
          <mj-text color="#64748B" font-size="12px" padding-top="16px">
            For your security this link expires soon. If you didn't expect this
            invite, you can ignore this email.
          </mj-text>
        </mj-column>
      </mj-section>
    `,
  });

  return {
    subject: "You've been invited to Book My Tech",
    html: await renderEmail(mjml),
  };
}
