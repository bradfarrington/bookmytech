import "server-only";
import { Expo } from "expo-server-sdk";
import { buildPushMessage, triageTickets, type PushNotification } from "@/lib/push/format";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordTestOutbox } from "@/lib/test-outbox";

// Push notifications to the customer mobile app, through Expo's push service
// (Task 19 / P1).
//
// Called from the same places SMS goes out today — ALONGSIDE it, not instead
// (app plan, decision 2): a mechanic taking the job, the mechanic setting off,
// a mechanic's message, and the service reminders. Like `sendSms`, every call
// is best-effort: it never throws, and a customer with no registered device is
// simply a no-op. The booking funnel and the job lifecycle must never block on
// a notification.
//
// Every notification carries `data.bookingId` — that is the ONLY thing the app
// deep-links on (`bookingIdFromResponse` in bmt-customer-app/src/lib/push.ts).
// Anything without it is just a banner.
//
// Tokens come from `customer_push_tokens` (0050), written by POST /devices.
// Two things keep the table honest, because Expo throttles a project that keeps
// sending to dead tokens:
//   1. a TICKET that comes back `DeviceNotRegistered` deletes the token at once;
//   2. every OK ticket is parked in `push_receipts`, and /api/cron/push-receipts
//      collects the receipts a few minutes later and deletes any token they
//      condemn — the receipt, not the ticket, is where most dead devices show.
//
// `EXPO_ACCESS_TOKEN` is optional — Expo accepts unauthenticated sends — but
// with it set, Expo attributes and rate-limits sends per PROJECT rather than
// per IP, which matters on Vercel where the IP is shared.

export type { PushNotification } from "@/lib/push/format";

/** Push receipts aren't ready immediately; don't ask before this. */
export const RECEIPT_CHECK_DELAY_MS = 10 * 60_000;
/** Expo keeps receipts for about a day; a ticket older than this is unanswerable. */
export const RECEIPT_MAX_AGE_MS = 24 * 60 * 60_000;

type Admin = ReturnType<typeof createAdminClient>;

let client: Expo | null = null;
function expo(): Expo {
  if (!client) {
    client = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN || undefined });
  }
  return client;
}

async function deleteTokens(admin: Admin, tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const { error } = await admin.from("customer_push_tokens").delete().in("token", tokens);
  if (error) console.error("[push] failed to delete dead tokens", error);
}

/**
 * Notify every device a customer has registered. Resolves to the number of
 * devices Expo accepted the message for (0 for a guest, a customer with no
 * device, or any failure). Never throws.
 */
export async function sendPushToCustomer(
  customerId: string | null | undefined,
  notification: PushNotification,
): Promise<number> {
  if (!customerId) return 0;

  // Test mode: capture the push and skip Expo (lib/test-outbox.ts).
  if (recordTestOutbox("push", { customerId, ...notification })) return 1;

  try {
    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from("customer_push_tokens")
      .select("token")
      .eq("customer_id", customerId);
    if (error) {
      console.error(
        "[push] couldn't read customer_push_tokens — has migration 0050 been applied?",
        error,
      );
      return 0;
    }

    const tokens = (rows ?? [])
      .map((r) => r.token as string)
      .filter((t) => Expo.isExpoPushToken(t));
    if (tokens.length === 0) return 0;

    const messages = tokens.map((t) => buildPushMessage(t, notification));
    let accepted = 0;
    const receipts: Array<{ ticket_id: string; token: string }> = [];
    const dead: string[] = [];

    for (const chunk of expo().chunkPushNotifications(messages)) {
      try {
        const tickets = await expo().sendPushNotificationsAsync(chunk);
        const triaged = triageTickets(chunk, tickets);
        receipts.push(...triaged.receipts);
        dead.push(...triaged.deadTokens);
        accepted += triaged.receipts.length;
        if (triaged.failed) console.error(`[push] ${triaged.failed} ticket(s) rejected by Expo`);
      } catch (err) {
        // One chunk failing (network, Expo outage) must not stop the others.
        console.error("[push] send failed", err);
      }
    }

    await deleteTokens(admin, dead);
    if (receipts.length > 0) {
      const { error: parkErr } = await admin
        .from("push_receipts")
        .upsert(receipts, { onConflict: "ticket_id", ignoreDuplicates: true });
      if (parkErr) console.error("[push] failed to park receipts", parkErr);
    }
    return accepted;
  } catch (err) {
    console.error("[push] unexpected failure", err);
    return 0;
  }
}

/**
 * Collect the receipts for parked tickets and delete any token Expo reports as
 * no longer registered. Called by /api/cron/push-receipts. Tickets too young
 * are left for next time; tickets too old are dropped unanswered.
 */
export async function collectPushReceipts(): Promise<{
  checked: number;
  deadTokens: number;
  expired: number;
}> {
  const admin = createAdminClient();
  const now = Date.now();

  // Expire what Expo will no longer answer for.
  const { data: expiredRows } = await admin
    .from("push_receipts")
    .delete()
    .lt("created_at", new Date(now - RECEIPT_MAX_AGE_MS).toISOString())
    .select("ticket_id");
  const expired = expiredRows?.length ?? 0;

  const { data: due, error } = await admin
    .from("push_receipts")
    .select("ticket_id, token")
    .lt("created_at", new Date(now - RECEIPT_CHECK_DELAY_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(1000);
  if (error) throw error;
  if (!due?.length) return { checked: 0, deadTokens: 0, expired };

  const tokenByTicket = new Map(due.map((r) => [r.ticket_id as string, r.token as string]));
  const dead = new Set<string>();
  const answered: string[] = [];

  for (const chunk of expo().chunkPushNotificationReceiptIds([...tokenByTicket.keys()])) {
    try {
      const receipts = await expo().getPushNotificationReceiptsAsync(chunk);
      for (const [ticketId, receipt] of Object.entries(receipts)) {
        answered.push(ticketId);
        if (receipt.status === "error") {
          const token = tokenByTicket.get(ticketId);
          if (receipt.details?.error === "DeviceNotRegistered" && token) {
            dead.add(token);
          } else {
            console.error(`[push] receipt error (${ticketId}): ${receipt.message}`, receipt.details);
          }
        }
      }
    } catch (err) {
      console.error("[push] receipt fetch failed", err);
    }
  }

  await deleteTokens(admin, [...dead]);
  if (answered.length > 0) {
    await admin.from("push_receipts").delete().in("ticket_id", answered);
  }
  return { checked: answered.length, deadTokens: dead.size, expired };
}
