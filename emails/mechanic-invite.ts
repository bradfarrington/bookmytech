import "server-only";
import { layout } from "./_layout";
import { renderEmail, escapeHtml } from "./render";

export interface MechanicInviteInput {
  /** Display name shown in the greeting. */
  name: string;
  /** Magic-link URL from `supabase.auth.admin.generateLink({ type: 'magiclink' })`. */
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
            Click the button below to sign in &mdash; the link will let you set up
            your password and complete your profile.
          </mj-text>
          <mj-button href="${safeLink}" align="left" padding="20px 0 8px">
            Sign in to Book My Tech
          </mj-button>
          <mj-text color="#64748B" font-size="12px" padding-top="16px">
            If the button doesn't work, paste this link into your browser:<br />
            <a href="${safeLink}">${safeLink}</a>
          </mj-text>
          <mj-text color="#64748B" font-size="12px">
            This link expires in 24 hours. If you didn't expect this invite, you
            can ignore this email.
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
