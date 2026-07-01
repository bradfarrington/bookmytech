import "server-only";
import { renderTemplateEmail, type RenderedEmail } from "./resolve";

export type { RenderedEmail };

export interface LowCreditEmailInput {
  /** The balance that tripped the alert. */
  balance: number;
  /** Absolute URL to the admin SMS settings page (buy-credits lives there). */
  settingsUrl: string;
}

// Fired once when the SMS credit balance drops to/below the low-credit
// threshold (see lib/sms/send-sms.ts). Re-armed on the next top-up.
export async function renderLowCreditEmail({
  balance,
  settingsUrl,
}: LowCreditEmailInput): Promise<RenderedEmail> {
  return renderTemplateEmail("low_sms_credits", {
    balance,
    plural: balance === 1 ? "credit" : "credits",
    settings_url: settingsUrl,
  });
}
