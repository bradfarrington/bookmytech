import "server-only";
import { renderTemplateEmail } from "./resolve";
import type { RenderedEmail } from "./mechanic-invite";

export interface AdminNewApplicationInput {
  applicantName: string;
  postcode: string;
  specialismCount: number;
  /** Absolute URL to the approvals queue, deep-linked to this application. */
  reviewLink: string;
}

// Internal alert to ops when a new mechanic application lands.
export async function renderAdminNewApplicationEmail({
  applicantName,
  postcode,
  specialismCount,
  reviewLink,
}: AdminNewApplicationInput): Promise<RenderedEmail> {
  return renderTemplateEmail("admin_new_application", {
    applicant_name: applicantName,
    postcode,
    specialism_count: specialismCount,
    review_link: reviewLink,
  });
}
