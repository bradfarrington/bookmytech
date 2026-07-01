import "server-only";
import { renderTemplateEmail } from "./resolve";
import type { RenderedEmail } from "./mechanic-invite";

export interface ApplicationReceivedInput {
  /** Applicant's display name for the greeting. */
  name: string;
}

// Sent to a prospective mechanic the moment they submit their application.
export async function renderApplicationReceivedEmail({
  name,
}: ApplicationReceivedInput): Promise<RenderedEmail> {
  return renderTemplateEmail("application_received", { name });
}
