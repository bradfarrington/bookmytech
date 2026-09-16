import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { renderTemplateEmail } from "@/emails/resolve";
import { sendEmail } from "@/lib/email/send";
import { siteUrl } from "@/lib/utils";
import { checkPassword, PASSWORD_CHECK_MESSAGES } from "./check-password";

// Changing the account email, start to finish, on our own screens, links and
// emails (Task 58). The one implementation, shared by:
//
//   • the website — app/actions/customer-account.ts, which resolves the caller
//     from the session COOKIE;
//   • the customer app — POST /api/mobile/v1/account/email, which resolves it
//     from a verified Bearer token.
//
// So the caller is a PARAMETER here and never derived, the same rule as
// lib/disputes/core.ts and lib/bookings/create-booking.ts.
//
// WHY NOT SUPABASE'S OWN FLOW
//
// It used to be `auth.updateUser({ email })` from the browser, so GoTrue sent
// its default template and its links went through the project's supabase.co
// verify endpoint. Replacing that with `admin.generateLink()` does not work:
// with Secure Email Change on, GoTrue wants BOTH addresses to confirm, that
// needs two tokens, and generateLink returns one per call while regenerating
// the pair each time. Checked against the live project on 2026-09-16 — after
// the `email_change_current` call, the token from the earlier
// `email_change_new` call came back `otp_expired`. Password reset can use
// generateLink because it needs exactly one token. This can't.
//
// So the pending change is ours (`pending_email_changes`, 0078) and
// `admin.updateUserById` applies it. What guards the account:
//
//   1. the current password, checked before anything is sent. GoTrue's flow
//      never asked for it, which is why the mockup's password field had been
//      dropped as decorative — it means something again;
//   2. the NEW address has to open a link, proving it is reachable and theirs;
//   3. the CURRENT address is told what was asked for, so nobody's account
//      moves quietly while they still read their old inbox.
//
// The token is never stored, only its sha256 — a leaked copy of the table can't
// move anyone's account. Single-use and good for 24 hours.
//
// Once applied, the `on_auth_user_email_changed` trigger (0065) carries the new
// address onto unfinished bookings and unsent reminders. That still works: it is
// on auth.users and fires however the email is updated.

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPORT_EMAIL = "support@bookmytech.co.uk";

export interface EmailChangeCaller {
  userId: string;
  email: string | null;
}

export type EmailChangeResult =
  | { ok: true; sentTo: string }
  | { ok: false; error: string; field?: "new_email" | "password" };

export type EmailChangeConfirmResult =
  | { ok: true; newEmail: string }
  | { ok: false; error: string };

export interface PendingEmailChange {
  newEmail: string;
  expiresAt: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The live, unexpired request for this account, for the "waiting" card. */
export async function pendingEmailChangeFor(
  customerId: string,
): Promise<PendingEmailChange | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("pending_email_changes")
    .select("new_email, expires_at")
    .eq("customer_id", customerId)
    .is("confirmed_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!data) return null;
  return { newEmail: data.new_email, expiresAt: data.expires_at };
}

/**
 * Ask to move the account to a new address.
 *
 * Checks the current password, records the pending change, emails a
 * confirmation link to the new address and a heads-up to the current one.
 * Nothing about the account changes until the link is opened.
 */
export async function requestEmailChangeFor(
  caller: EmailChangeCaller,
  input: { newEmail: string; currentPassword: string },
  context: { ip?: string | null } = {},
): Promise<EmailChangeResult> {
  const currentEmail = caller.email;
  if (!currentEmail) {
    return { ok: false, error: "Please sign in again to change your email." };
  }

  const next = input.newEmail.trim().toLowerCase();
  if (!next || !EMAIL_SHAPE.test(next)) {
    return { ok: false, field: "new_email", error: "Enter a valid email address." };
  }
  if (next === currentEmail.toLowerCase()) {
    return { ok: false, field: "new_email", error: "That's already your email address." };
  }
  if (!input.currentPassword) {
    return { ok: false, field: "password", error: "Enter your current password." };
  }

  const check = await checkPassword(currentEmail, input.currentPassword);
  if (check !== "ok") {
    return {
      ok: false,
      field: check === "wrong" ? "password" : undefined,
      error: PASSWORD_CHECK_MESSAGES[check],
    };
  }

  const admin = createAdminClient();

  // Is the address already somebody's? Told plainly, because the alternative is
  // sending a link that can only fail at the last step. This does leak that an
  // address has an account — but only to someone who has just proved they own
  // *this* account with its password, and GoTrue's own flow said the same thing.
  if (await emailIsTaken(next, caller.userId)) {
    return { ok: false, field: "new_email", error: "That email address is already in use." };
  }

  // Supersede any earlier request. Also what keeps the one-live-row index happy.
  await admin
    .from("pending_email_changes")
    .delete()
    .eq("customer_id", caller.userId)
    .is("confirmed_at", null);

  // 32 bytes of randomness, base64url. Only ever leaves here inside the email.
  const token = randomBytes(32).toString("base64url");
  const { error: insertError } = await admin.from("pending_email_changes").insert({
    customer_id: caller.userId,
    new_email: next,
    token_hash: hashToken(token),
    requested_ip: context.ip ?? null,
    expires_at: new Date(Date.now() + TOKEN_TTL_MS).toISOString(),
  });
  if (insertError) {
    console.error("[email-change] could not record the request", caller.userId, insertError.message);
    return { ok: false, error: "We couldn't start the change just now. Please try again." };
  }

  const base = siteUrl();
  const actionLink = `${base}/account/confirm-email?token=${encodeURIComponent(token)}`;
  const name = await displayName(admin, caller.userId);

  // The link to the new address is the one that matters, so a failure to send it
  // fails the request and the pending row is dropped again. Without this a
  // customer would be told to check an inbox nothing arrived in.
  try {
    const { subject, html } = await renderTemplateEmail("email_change_confirm", {
      name,
      new_email: next,
      current_email: currentEmail,
      action_link: actionLink,
    });
    await sendEmail({ to: next, subject, html });
  } catch (err) {
    console.error("[email-change] confirmation email failed", caller.userId, err);
    await admin
      .from("pending_email_changes")
      .delete()
      .eq("customer_id", caller.userId)
      .is("confirmed_at", null);
    return { ok: false, error: "We couldn't send the confirmation email. Please try again shortly." };
  }

  // The heads-up to the old address is best-effort: the change is already
  // recorded and the customer already told to check their new inbox, so a Resend
  // hiccup here must not undo it. Logged so it can be chased.
  try {
    const { subject, html } = await renderTemplateEmail("email_change_notice", {
      name,
      new_email: next,
      current_email: currentEmail,
      support_email: SUPPORT_EMAIL,
    });
    await sendEmail({ to: currentEmail, subject, html });
  } catch (err) {
    console.error("[email-change] notice to the old address failed", caller.userId, err);
  }

  return { ok: true, sentTo: next };
}

const EXPIRED_MESSAGE =
  "That link has expired or has already been used. Please ask for a new one.";

interface LiveChangeRow {
  id: string;
  customer_id: string;
  new_email: string;
}

/** The unspent, unexpired row a token names, or null. Never spends anything. */
async function liveRowFor(token: string): Promise<LiveChangeRow | null> {
  if (!token || token.length > 512) return null;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("pending_email_changes")
    .select("id, customer_id, new_email, token_hash, expires_at, confirmed_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!row) return null;

  // The lookup was already by hash, so this is belt and braces against a
  // comparison that could otherwise leak timing. Cheap, and it keeps the
  // "compare secrets in constant time" habit where secrets are compared.
  if (!sameHash(row.token_hash, hashToken(token))) return null;

  if (row.confirmed_at) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

  return { id: row.id, customer_id: row.customer_id, new_email: row.new_email };
}

/**
 * Look at a token without spending it, so the landing page can say what is
 * about to happen and offer a button.
 *
 * The confirmation is a POST behind that button rather than the GET of opening
 * the link, because the link is opened from an email client: corporate scanners
 * and "safe links" services fetch URLs in messages, and a single-use token
 * fetched by a scanner is a token the customer never gets to use. They would
 * see "that link has expired" with no way to tell why.
 */
export async function peekEmailChange(
  token: string,
): Promise<{ ok: true; newEmail: string } | { ok: false; error: string }> {
  const row = await liveRowFor(token);
  if (!row) return { ok: false, error: EXPIRED_MESSAGE };
  return { ok: true, newEmail: row.new_email };
}

/**
 * Redeem a confirmation token and move the account.
 *
 * Takes no caller: the token is the proof, and it arrives from an email client
 * that may not be signed in. It is single-use, expires, and only ever moves the
 * one account it was issued for.
 */
export async function confirmEmailChange(token: string): Promise<EmailChangeConfirmResult> {
  const expired = { ok: false as const, error: EXPIRED_MESSAGE };

  const row = await liveRowFor(token);
  if (!row) return expired;
  const admin = createAdminClient();

  // Re-check at the last moment: someone else may have taken the address during
  // the 24 hours this link was valid.
  if (await emailIsTaken(row.new_email, row.customer_id)) {
    return {
      ok: false,
      error: "That email address is now in use by another account. Please try a different one.",
    };
  }

  // Spend the token FIRST. If the update then fails the customer asks again,
  // which is the safe way round: the alternative leaves a live token after the
  // address has already moved.
  const { data: spent } = await admin
    .from("pending_email_changes")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("confirmed_at", null)
    .select("id")
    .maybeSingle();
  if (!spent) return expired; // someone else redeemed it a moment ago

  // `email_confirm: true` because opening this link IS the confirmation. Without
  // it GoTrue would want its own, which is the thing being replaced.
  const { error } = await admin.auth.admin.updateUserById(row.customer_id, {
    email: row.new_email,
    email_confirm: true,
  });
  if (error) {
    console.error("[email-change] could not apply the change", row.customer_id, error.code, error.message);
    // A duplicate is final, so the token stays spent: the same link can only
    // fail the same way, and asking again with a different address is the only
    // way forward. `emailIsTaken` above is a nicety, not the guard, so this is
    // the check that actually holds.
    if (error.code === "email_exists" || /already|exists|registered/i.test(error.message)) {
      return {
        ok: false,
        error: "That email address is now in use by another account. Please try a different one.",
      };
    }
    // Anything else could be transient, so hand the token back and let the same
    // link work on a retry.
    await admin.from("pending_email_changes").update({ confirmed_at: null }).eq("id", row.id);
    return { ok: false, error: "We couldn't finish the change just now. Please try the link again." };
  }

  return { ok: true, newEmail: row.new_email };
}

/**
 * Is this address already on an account other than `exceptUserId`?
 *
 * There is no cheap authoritative way to ask. The address lives only on
 * `auth.users` — `profiles` has no email column — and `auth.admin.listUsers()`
 * takes a page number and nothing else, so answering through supabase-js would
 * mean walking every user. GoTrue's own `GET /admin/users?filter=` does the
 * lookup, so this calls it directly.
 *
 * That endpoint is not in the supabase-js types, so treat it as a NICETY and
 * never as the guard: any failure returns false and lets the flow continue, and
 * `updateUserById` refuses a duplicate at confirm time regardless. All this buys
 * is telling someone straight away rather than after a round trip through their
 * inbox. `filter` is a substring match, so the results are compared exactly.
 */
async function emailIsTaken(email: string, exceptUserId?: string): Promise<boolean> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return false;

  try {
    const url = `${base}/auth/v1/admin/users?filter=${encodeURIComponent(email)}&per_page=20`;
    const res = await fetch(url, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { users?: { id: string; email?: string }[] };
    return (body.users ?? []).some(
      (u) => u.id !== exceptUserId && (u.email ?? "").toLowerCase() === email,
    );
  } catch (err) {
    console.error("[email-change] duplicate-address check unavailable", err);
    return false;
  }
}

async function displayName(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
): Promise<string> {
  const { data } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  return data?.full_name?.trim().split(/\s+/)[0] || "there";
}

function sameHash(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}
