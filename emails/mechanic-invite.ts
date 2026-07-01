import "server-only";
import { renderTemplateEmail, type RenderedEmail } from "./resolve";

// Re-exported so the many templates that import `RenderedEmail` from here keep
// working. The canonical type now lives in ./resolve.
export type { RenderedEmail };

export interface MechanicInviteInput {
  /** Display name shown in the greeting. */
  name: string;
  /** Recovery link from `generateLink({ type: 'recovery' })` → /mechanic/set-password. */
  actionLink: string;
}

export async function renderMechanicInviteEmail({
  name,
  actionLink,
}: MechanicInviteInput): Promise<RenderedEmail> {
  return renderTemplateEmail("mechanic_invite", { name, action_link: actionLink });
}
