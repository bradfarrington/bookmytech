import "server-only";
import { layout } from "./_layout";
import { renderEmail } from "./render";

export interface LowCreditEmailInput {
  /** The balance that tripped the alert. */
  balance: number;
  /** Absolute URL to the admin SMS settings page (buy-credits lives there). */
  settingsUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
}

// Fired once when the SMS credit balance drops to/below the low-credit
// threshold (see lib/sms/send-sms.ts). Re-armed on the next top-up.
export async function renderLowCreditEmail({
  balance,
  settingsUrl,
}: LowCreditEmailInput): Promise<RenderedEmail> {
  const plural = balance === 1 ? "credit" : "credits";

  const mjml = layout({
    preheader: `Only ${balance} SMS ${plural} left — top up to keep notifications sending.`,
    content: `
      <mj-section background-color="#FFFFFF" padding="8px 24px 0">
        <mj-column>
          <mj-text font-size="22px" font-weight="800" line-height="1.3" color="#0F172A">
            Low SMS credits
          </mj-text>
          <mj-text>
            Your Book My Tech SMS balance has dropped to
            <strong>${balance} ${plural}</strong>.
          </mj-text>
        </mj-column>
      </mj-section>

      <mj-section background-color="#FFFFFF" padding="8px 24px 0">
        <mj-column background-color="#FEF3C7" border-radius="8px" padding="20px">
          <mj-text align="center" font-size="40px" font-weight="800" color="#B45309" padding="0">
            ${balance}
          </mj-text>
          <mj-text align="center" font-size="12px" font-weight="700" color="#92400E" letter-spacing="1px" padding="4px 0 0">
            CREDITS REMAINING
          </mj-text>
        </mj-column>
      </mj-section>

      <mj-section background-color="#FFFFFF" padding="8px 24px 0">
        <mj-column>
          <mj-text>
            Once credits reach zero, SMS notifications (booking updates,
            reminders, message nudges) stop sending until you top up. Email
            still goes out as normal.
          </mj-text>
          <mj-button href="${settingsUrl}" align="left" padding="20px 0 8px">
            Buy more credits
          </mj-button>
        </mj-column>
      </mj-section>
    `,
  });

  return {
    subject: `Low SMS credits — ${balance} ${plural} remaining`,
    html: await renderEmail(mjml),
  };
}
