import "server-only";
import { renderTemplateEmail, type RenderedEmail } from "./resolve";
import { REMINDER_META, type ReminderType } from "@/lib/reminders/types";

export type { RenderedEmail };

export interface ReminderEmailInput {
  type: ReminderType;
  name: string;
  vehicleReg: string;
  /** Click-through URL (/r/<token>) that marks acted_on_at + deep-links to book. */
  ctaUrl: string;
  /** One-click opt-out / manage-preferences URL. */
  preferencesUrl: string;
}

// One parameterised template for every reminder type — the per-type copy comes
// from REMINDER_META (passed as merge vars) so the email, the dashboard, and the
// derive logic never drift. The wrapper copy is admin-editable.
export async function renderReminderEmail({
  type,
  name,
  vehicleReg,
  ctaUrl,
  preferencesUrl,
}: ReminderEmailInput): Promise<RenderedEmail> {
  const meta = REMINDER_META[type];
  return renderTemplateEmail("reminder", {
    subject: meta.subject,
    label: meta.label,
    reg: vehicleReg,
    name,
    blurb: meta.blurb,
    cta: meta.cta,
    cta_url: ctaUrl,
    prefs_url: preferencesUrl,
  });
}
