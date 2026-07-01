import "server-only";
import { renderTemplateEmail } from "./resolve";
import type { RenderedEmail } from "./mechanic-invite";

export interface ApplicationApprovedInput {
  name: string;
  /** token_hash recovery link into /auth/callback → /mechanic/set-password. */
  actionLink: string;
  /** If approved with grace, the deadline + outstanding items copy. */
  grace?: { endsOn: string; outstanding: string[] } | null;
}

// Sent when an application is approved. The link is a recovery link that drops
// the mechanic on /mechanic/set-password to choose a password.
export async function renderApplicationApprovedEmail({
  name,
  actionLink,
  grace,
}: ApplicationApprovedInput): Promise<RenderedEmail> {
  return renderTemplateEmail("application_approved", {
    name,
    action_link: actionLink,
    grace_ends_on: grace?.endsOn ?? "",
    grace_outstanding: grace ? grace.outstanding.join("|") : "",
  });
}
