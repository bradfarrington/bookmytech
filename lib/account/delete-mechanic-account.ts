import "server-only";
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/send";
import { renderTemplateEmail } from "@/emails/resolve";
import { removeAvatarObjects } from "@/lib/mechanics/avatar";
import { DOCS_BUCKET_NAME, mechanicDocumentPaths } from "@/lib/mechanics/documents";
import { deletedSentinelEmail } from "./blockers";
import {
  mechanicDeletionBlocker,
  type MechanicDeletionBlockerCode,
} from "./mechanic-blockers";

// A MECHANIC deletes their own account (Task 70). App Store guideline 5.1.1(v)
// applies to the mechanic app too, and a mechanic can sign up in it.
//
// WHY NOT `delete_customer_account()`. That function is role-gated to
// `role = 'customer'` and would raise on a mechanic profile — correctly, because
// it knows nothing about what a mechanic has: an earnings ledger, live job
// offers, documents in a private bucket, availability, a location fix, its own
// push tokens, and a `mechanics` row that dispatch reads. `delete_mechanic_account`
// (0086) is its twin for that shape.
//
// WHAT "DELETE" MEANS, and it is the same answer as the customer's: the profile
// is anonymised IN PLACE and kept. Completed bookings are financial records, the
// `mechanic_ledger` references the mechanic, and `reviews.mechanic_id`,
// `booking_events.actor_id`, `messages.sender_id`, `disputes.opened_by` and every
// `reviewed_by` audit column point at `profiles(id)` with no `on delete` clause.
// The `mechanics` row stays too — `bookings.mechanic_id` references it — but it
// goes offline and permanently suspended, which is the pair of gates dispatch
// reads (lib/dispatch/dispatch.ts), so it can never be offered another job.
//
// THE ORDER, and why:
//
//   1. The blockers, which are the mechanic's money and other people's
//      unfinished business (./mechanic-blockers.ts).
//   2. Revoke every session (global sign-out), so a second device stops at the
//      same moment.
//   3. Email the OLD address — the one thing that lets someone notice a deletion
//      they did not make. Awaited; a failure is logged and does not stop it.
//   4. The private bucket: every `mechanic-docs` object, and the avatar. Storage
//      is not transactional, so it goes BEFORE the database — if it fails, the
//      rows are still there to retry from. The reverse order would leave orphan
//      files nothing points at.
//   5. The database, in ONE transaction (`delete_mechanic_account`, 0086).
//   6. The auth row: sentinel email, random password, cleared metadata, a ban
//      that will not expire.
//
// 5 before 6 for the same reason as the customer path: if 6 fails after 5 they
// can still sign in and retry, and 5 is idempotent.

export interface MechanicDeletionCaller {
  userId: string;
  email: string | null;
  /** The Bearer token the request carried — what the global sign-out takes. */
  accessToken: string;
}

export interface MechanicDeletionContext {
  source: string;
  ip: string | null;
}

export type MechanicDeletionResult =
  | { ok: true }
  | { ok: false; code: MechanicDeletionBlockerCode | "staff_account"; error: string };

const PERMANENT_BAN = "876000h";

export class MechanicDeletionError extends Error {
  constructor(
    public readonly step: "database" | "auth",
    cause: unknown,
  ) {
    super(
      `mechanic deletion failed at ${step}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
    this.name = "MechanicDeletionError";
  }
}

type Admin = ReturnType<typeof createAdminClient>;

/** Everything the refusal check reads, in one place. */
async function loadBlockerState(admin: Admin, mechanicId: string) {
  const { data: bookings } = await admin
    .from("bookings")
    .select("id, status")
    .eq("mechanic_id", mechanicId);
  const bookingIds = (bookings ?? []).map((b) => b.id as string);

  const { data: disputes } = bookingIds.length
    ? await admin.from("disputes").select("status").in("booking_id", bookingIds)
    : { data: [] };

  // The Resolution Center's tables may not exist on every environment yet
  // (0085 creates them), so a failure here reads as "no open cases" rather than
  // blocking a deletion on a table that isn't there.
  const { data: cases } = await admin
    .from("resolution_cases")
    .select("status")
    .eq("mechanic_id", mechanicId);

  const { data: ledger } = await admin
    .from("mechanic_ledger")
    .select("amount_pence")
    .eq("mechanic_id", mechanicId);

  return {
    bookingStatuses: (bookings ?? []).map((b) => b.status as string),
    disputeStatuses: (disputes ?? []).map((d) => d.status as string),
    caseStatuses: (cases ?? []).map((c) => c.status as string),
    balancePence: (ledger ?? []).reduce((sum, r) => sum + ((r.amount_pence as number) ?? 0), 0),
  };
}

/**
 * Delete the caller's mechanic account. Refuses at `{ ok: false }` while a job
 * is live, a dispute or a case is open, or the ledger isn't settled; throws
 * `MechanicDeletionError` when a step that must succeed does not.
 *
 * WHO is deleted comes from `caller`, which the trusted layer resolved from a
 * verified token. Nothing in any request body can name another account.
 */
export async function deleteMechanicAccountFor(
  caller: MechanicDeletionCaller,
  context: MechanicDeletionContext,
): Promise<MechanicDeletionResult> {
  const admin = createAdminClient();

  // An admin who also works jobs keeps `role = 'admin'` and a `mechanics` row
  // (lib/mechanics/require-mechanic.ts). Deleting "their" account through the
  // mechanic app would take the admin role and everything it can reach with it,
  // so it is refused here exactly as a staff token is on the customer route.
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", caller.userId)
    .maybeSingle();
  if (profile?.role === "admin") {
    return {
      ok: false,
      code: "staff_account",
      error:
        "This account also has Book My Tech admin access, so it can't be deleted from the app. Contact Book My Tech.",
    };
  }

  const blocker = mechanicDeletionBlocker(await loadBlockerState(admin, caller.userId));
  if (blocker) return { ok: false, ...blocker };

  const sentinel = deletedSentinelEmail(caller.userId);

  // 2. Every session, every device.
  const { error: signOutError } = await admin.auth.admin.signOut(caller.accessToken, "global");
  if (signOutError) {
    console.error(
      "[mechanic/account/delete] global sign-out failed",
      caller.userId,
      signOutError.message,
    );
  }

  // 3. Tell the old address before it goes.
  if (caller.email) {
    try {
      const { subject, html } = await renderTemplateEmail("mechanic_account_deleted", {});
      await sendEmail({ to: caller.email, subject, html });
    } catch (err) {
      console.error("[mechanic/account/delete] confirmation email failed", caller.userId, err);
    }
  }

  // 4. The files. Never fatal — a leftover object is a tidy-up, a half-deleted
  // account is not — but logged with the id so it can be chased.
  const paths = await mechanicDocumentPaths(admin, caller.userId);
  if (paths.length > 0) {
    const { error } = await admin.storage.from(DOCS_BUCKET_NAME).remove(paths);
    if (error) {
      console.error("[mechanic/account/delete] document removal failed", caller.userId, error.message);
    }
  }
  await removeAvatarObjects(admin, caller.userId);

  // 5. The database, atomically.
  const { data: counts, error: rpcError } = await admin.rpc("delete_mechanic_account", {
    p_user_id: caller.userId,
    p_sentinel_email: sentinel,
    p_source: context.source,
    p_ip: context.ip,
  });
  if (rpcError) throw new MechanicDeletionError("database", rpcError);

  // 6. The auth row: unusable, undeliverable, banned.
  const { error: authError } = await admin.auth.admin.updateUserById(caller.userId, {
    email: sentinel,
    email_confirm: true,
    password: randomBytes(32).toString("base64url"),
    user_metadata: { full_name: null },
    ban_duration: PERMANENT_BAN,
  });
  if (authError) throw new MechanicDeletionError("auth", authError);

  console.info("[mechanic/account/delete] deleted", caller.userId, JSON.stringify(counts));
  return { ok: true };
}
