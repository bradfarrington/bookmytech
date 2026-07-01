import "server-only";
import { renderTemplateEmail } from "./resolve";
import type { RenderedEmail } from "./mechanic-invite";

export interface ApplicationRejectedInput {
  name: string;
  reason: string;
}

export async function renderApplicationRejectedEmail({
  name,
  reason,
}: ApplicationRejectedInput): Promise<RenderedEmail> {
  return renderTemplateEmail("application_rejected", { name, reason });
}
