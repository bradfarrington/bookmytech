import { EMAIL_TEMPLATE_BY_KEY } from "@/emails/registry";

// Which templates an admin may NOT switch off (Task 22). Plain module — no
// "server-only" — so the admin editors can hide the switch on these rows.
//
// Locked: anything security-critical or that only ever reaches the ops inbox.
// Switching off a password reset would lock customers out; switching off an
// internal alert would hide a problem from the people meant to fix it.

/** Email templates that stay on no matter what. */
export const LOCKED_EMAIL_KEYS: ReadonlySet<string> = new Set(["password_reset"]);

export function isEmailTemplateLocked(key: string): boolean {
  if (LOCKED_EMAIL_KEYS.has(key)) return true;
  return EMAIL_TEMPLATE_BY_KEY[key]?.category === "internal";
}

/** Every SMS template is toggleable — they're all customer/mechanic courtesy texts. */
export function isSmsTemplateLocked(): boolean {
  return false;
}
