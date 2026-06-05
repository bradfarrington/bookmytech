import "server-only";
import { layout } from "./_layout";
import { renderEmail, escapeHtml } from "./render";
import { REMINDER_META, type ReminderType } from "@/lib/reminders/types";

export interface ReminderEmailInput {
  type: ReminderType;
  name: string;
  vehicleReg: string;
  /** Click-through URL (/r/<token>) that marks acted_on_at + deep-links to book. */
  ctaUrl: string;
  /** One-click opt-out / manage-preferences URL. */
  preferencesUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

// One parameterised template for every reminder type — the copy comes from
// REMINDER_META so the email, the dashboard, and the derive logic never drift.
export async function renderReminderEmail({
  type,
  name,
  vehicleReg,
  ctaUrl,
  preferencesUrl,
}: ReminderEmailInput): Promise<RenderedEmail> {
  const meta = REMINDER_META[type];
  const safeName = escapeHtml(name);
  const safeReg = escapeHtml(vehicleReg);
  const safeCta = escapeHtml(ctaUrl);
  const safePrefs = escapeHtml(preferencesUrl);

  const mjml = layout({
    preheader: meta.subject,
    content: `
      <mj-section background-color="#FFFFFF" padding="8px 24px 0">
        <mj-column>
          <mj-text font-size="22px" font-weight="800" line-height="1.3" color="#0F172A">
            ${escapeHtml(meta.label)} — ${safeReg}
          </mj-text>
          <mj-text>
            Hi ${safeName},
          </mj-text>
          <mj-text>
            ${escapeHtml(meta.blurb)}
          </mj-text>
          <mj-button href="${safeCta}" align="left" padding="20px 0 8px">
            ${escapeHtml(meta.cta)}
          </mj-button>
          <mj-text color="#64748B" font-size="12px" padding-top="16px">
            Not the right time? You can
            <a href="${safePrefs}">manage your reminders</a> or turn them off any
            time.
          </mj-text>
        </mj-column>
      </mj-section>
    `,
  });

  return {
    subject: meta.subject,
    html: await renderEmail(mjml),
  };
}
