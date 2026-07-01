import "server-only";
import { renderTemplateEmail, type RenderedEmail } from "./resolve";

export type { RenderedEmail };

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
  const dayLine = daysRemaining <= 1 ? "just 1 day left" : `${daysRemaining} days left`;
  return renderTemplateEmail("grace_period_reminder", {
    name,
    day_line: dayLine,
    ends_on: endsOn,
    outstanding: outstanding.join("|"),
    documents_link: documentsLink,
  });
}
