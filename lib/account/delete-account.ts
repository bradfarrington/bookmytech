import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import {
  deletionBlocker,
  deletedSentinelEmail,
  type BlockerBooking,
  type DeletionBlockerCode,
} from "./blockers";

// A customer deletes their own account (Task 39). The shared core: the mobile
// route is a thin wrapper, and the website's settings page will be the same
// wrapper when it grows the button.
//
// WHAT "DELETE" MEANS. Completed bookings are financial records (HMRC wants six
// years, the mechanic payout ledger references them, a review feeds a public
// rating), and the FK graph would refuse a hard delete of the profile anyway
// (messages.sender_id, disputes.opened_by, … reference profiles(id) with no
// `on delete`). So the profile is anonymised IN PLACE and kept, the bookings
// are scrubbed of contact details and kept, and only what is theirs alone —
// push tokens, unsent reminders, unspent credit — is deleted. The auth row is
// made unusable rather than deleted: `profiles.id` cascades from `auth.users`
// (docs/02-data-model.md), and deleting it would take the profile — and every
// row pointing at it — with it.
//
// THE ORDER, and why:
//
//   1. Revoke every session (global sign-out) — a second device stops working
//      at the same moment. Uses the caller's own JWT: that is the handle the
//      auth API takes, and it is the one thing we know is theirs.
//   2. Email the OLD address: "your account has been deleted". The one thing
//      that lets someone notice a deletion they did not make. Awaited, but a
//      failure is logged and does not stop the deletion.
//   3. The database, in ONE transaction (`delete_customer_account`, 0065).
//   4. The auth row: sentinel email, random password, cleared metadata, a ban
//      that will not expire. Sign-in, password reset and email change are all
//      closed; the real address is freed for a fresh sign-up.
//
// 3 before 4 on purpose. If 4 fails after 3, the customer sees an error, signs
// in again (their credentials still work), and retries: 3 is idempotent and 4
// runs again. The other order would leave someone locked out of an account
// whose data is still intact, with no way to try again.
//
// Stripe: the CRM only ever creates PaymentIntents, never a Customer object,
// so there is nothing to delete there. A hold on a live booking can't exist
// here (live bookings refuse deletion); an abandoned checkout hold expires on
// its own after seven days.

export interface AccountDeletionCaller {
  userId: string;
  /** The real address, from the verified token. Null only if auth has none. */
  email: string | null;
  /** The Bearer token the request carried — what the global sign-out takes. */
  accessToken: string;
}

export interface AccountDeletionContext {
  /** Where the request came from — 'mobile' today. Written to the audit row. */
  source: string;
  ip: string | null;
}

export type AccountDeletionResult =
  | { ok: true }
  | { ok: false; code: DeletionBlockerCode; error: string };

/** A ban Supabase parses as a Go duration. 100 years: it will not expire. */
const PERMANENT_BAN = "876000h";

export class AccountDeletionError extends Error {
  constructor(
    public readonly step: "database" | "auth",
    cause: unknown,
  ) {
    super(`account deletion failed at ${step}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "AccountDeletionError";
  }
}

/**
 * The bookings the refusal check reads: everything the customer can see, by
 * id or (guest-era rows) by email — the same two arms as the read policy.
 */
async function loadBlockerBookings(
  admin: ReturnType<typeof createAdminClient>,
  caller: AccountDeletionCaller,
): Promise<BlockerBooking[]> {
  let query = admin
    .from("bookings")
    // `job_quotes` reaches `bookings` three ways (booking_id, follow_on_booking_id,
    // and bookings.source_quote_id back the other way), so the embed names its
    // column or PostgREST refuses it as ambiguous.
    .select("status, disputes(status), job_quotes!booking_id(status, expires_at)");
  query = caller.email
    ? query.or(`customer_id.eq.${caller.userId},and(customer_id.is.null,customer_email.eq."${caller.email}")`)
    : query.eq("customer_id", caller.userId);
  const { data, error } = await query;
  if (error) throw new AccountDeletionError("database", error);
  return (data ?? []) as BlockerBooking[];
}

/**
 * Delete the caller's account. Refuses at `{ ok: false }` while a booking is
 * live, a dispute is open or a quote is unanswered; throws
 * `AccountDeletionError` when a step that must succeed does not.
 *
 * WHO is deleted comes from `caller`, which the trusted layer resolved from a
 * verified token. Nothing in any request body can name another account.
 */
export async function deleteCustomerAccountFor(
  caller: AccountDeletionCaller,
  context: AccountDeletionContext,
): Promise<AccountDeletionResult> {
  const admin = createAdminClient();

  const blocker = deletionBlocker(await loadBlockerBookings(admin, caller));
  if (blocker) return { ok: false, ...blocker };

  const sentinel = deletedSentinelEmail(caller.userId);

  // 1. Every session, every device.
  const { error: signOutError } = await admin.auth.admin.signOut(caller.accessToken, "global");
  if (signOutError) {
    // Not fatal: the ban in step 4 closes sign-in, and the token this request
    // carried dies with the password. Logged so a pattern would be noticed.
    console.error("[account/delete] global sign-out failed", caller.userId, signOutError.message);
  }

  // 2. Tell the old address before it goes.
  if (caller.email) {
    try {
      const { subject, html } = await renderTemplateEmail("account_deleted", {});
      await sendEmail({ to: caller.email, subject, html });
    } catch (err) {
      console.error("[account/delete] confirmation email failed", caller.userId, err);
    }
  }

  // 3. The database, atomically.
  const { data: counts, error: rpcError } = await admin.rpc("delete_customer_account", {
    p_user_id: caller.userId,
    p_email: caller.email,
    p_sentinel_email: sentinel,
    p_source: context.source,
    p_ip: context.ip,
  });
  if (rpcError) throw new AccountDeletionError("database", rpcError);

  // 4. The auth row: unusable, undeliverable, banned. `email_confirm` stops
  // Supabase mailing a confirmation to an address nothing receives.
  const { error: authError } = await admin.auth.admin.updateUserById(caller.userId, {
    email: sentinel,
    email_confirm: true,
    password: randomBytes(32).toString("base64url"),
    user_metadata: { full_name: null },
    ban_duration: PERMANENT_BAN,
  });
  if (authError) throw new AccountDeletionError("auth", authError);

  console.info("[account/delete] deleted", caller.userId, JSON.stringify(counts));
  return { ok: true };
}
