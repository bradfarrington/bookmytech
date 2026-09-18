import { EMAIL_TEMPLATE_BY_KEY } from "@/emails/registry";

// Which templates an admin may NOT switch off (Task 22). Plain module — no
// "server-only" — so the admin editors can hide the switch on these rows.
//
// Locked: anything security-critical or that only ever reaches the ops inbox.
// Switching off a password reset would lock customers out; switching off an
// internal alert would hide a problem from the people meant to fix it; and
// the account-deleted confirmation is the one thing that lets someone notice
// a deletion they did not make.
//
// The two email-change templates (Task 58) are locked for exactly those two
// reasons:
//   • `email_change_confirm` carries the ONLY link that completes the change.
//     Switched off, the request still succeeds and tells the customer to check
//     their new inbox — where nothing ever arrives. They cannot move their
//     address and have no way to tell why. Same failure as a switched-off
//     password reset.
//   • `email_change_notice` is the only warning the CURRENT address gets. It is
//     what lets someone notice an account being moved that they did not ask
//     for, which is the same argument as `account_deleted`.
//
// `mechanic_account_deleted` is the mechanic twin of `account_deleted` and is
// locked for the same reason (Task 70).

/** Email templates that stay on no matter what. */
export const LOCKED_EMAIL_KEYS: ReadonlySet<string> = new Set([
  "password_reset",
  "account_deleted",
  "mechanic_account_deleted",
  "email_change_confirm",
  "email_change_notice",
]);

export function isEmailTemplateLocked(key: string): boolean {
  if (LOCKED_EMAIL_KEYS.has(key)) return true;
  return EMAIL_TEMPLATE_BY_KEY[key]?.category === "internal";
}

/** Every SMS template is toggleable — they're all customer/mechanic courtesy texts. */
export function isSmsTemplateLocked(): boolean {
  return false;
}
