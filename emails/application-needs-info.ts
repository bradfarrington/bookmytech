import "server-only";
import { renderTemplateEmail } from "./resolve";
import type { RenderedEmail } from "./mechanic-invite";

export interface ApplicationNeedsInfoInput {
  name: string;
  note: string;
  /** Public resubmit link keyed by the application's resubmit_token. */
  resubmitLink: string;
}

export async function renderApplicationNeedsInfoEmail({
  name,
  note,
  resubmitLink,
}: ApplicationNeedsInfoInput): Promise<RenderedEmail> {
  return renderTemplateEmail("application_needs_info", {
    name,
    note,
    resubmit_link: resubmitLink,
  });
}
