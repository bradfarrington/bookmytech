import "server-only";

import { revalidatePath } from "next/cache";
import { CLOSED_STATUSES } from "./constants";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms/send-sms";
import { renderSmsTemplate } from "@/lib/sms/render-template";
import { ANDROID_UPDATES_CHANNEL } from "@/lib/push/format";
import { sendPushToCustomer, sendPushToMechanic } from "@/lib/push/send";
import { ownsBooking, type BookingCaller } from "@/lib/bookings/ownership";
import { shortPersonName } from "@/lib/utils";

// The one implementation of "post into a booking's message thread" and "mark
// the other side's messages read" (Task 09 Stage 2 messaging, Task 19 / P3).
//
// Two callers, two ways of knowing who is asking — same split, same reasons,
// as lib/bookings/manage-booking.ts and lib/disputes/core.ts:
//
//   • the website — app/actions/messages.ts, thin "use server" wrappers that
//     resolve the caller from the session COOKIE;
//   • the mobile app — app/api/mobile/v1/bookings/[id]/messages, which resolves
//     the caller from a verified `Authorization: Bearer` token.
//
// So the caller is a PARAMETER here, never derived, and it must never become
// an argument of the "use server" exports (every export of such a file is
// browser-reachable with arguments of the caller's choosing).
//
// `messages` has no INSERT policy (0019) — writes go through the service-role
// client here so we can stamp `sender_role` and keep the party check server-
// side. The party check is therefore the whole of the protection. Reads are
// RLS: customers under "Customers read own booking messages", mechanics under
// their own policy, so both clients read the thread straight from Supabase.

export type MessageResult =
  | {
      ok: true;
      /** `sendMessageFor`: the new message's id. */
      id?: string;
      /** `markMessagesReadFor`: how many of the other side's messages this marked read. */
      cleared?: number;
    }
  | { ok: false; error: string };

export const MAX_MESSAGE_CHARS = 2000;

/**
 * Statuses on which the thread is closed to new messages. A finished or
 * cancelled job has nothing left to coordinate, and a message into it would
 * SMS/push the other party about a job that's over. `disputed` is deliberately
 * NOT here — the dispute thread is the place for that conversation, but the
 * booking thread stays open so the parties can still arrange practicalities.
 */
// Lives in ./constants so testable modules can read it without pulling in
// this "server-only" file. Re-exported because callers already import it here.
export { CLOSED_STATUSES } from "./constants";

type Admin = ReturnType<typeof createAdminClient>;

export interface MessageBooking {
  id: string;
  customer_id: string | null;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  mechanic_id: string | null;
  status: string;
}

export type MessageParty =
  | {
      ok: true;
      admin: Admin;
      booking: MessageBooking;
      role: "customer" | "mechanic";
    }
  | { ok: false; error: string };

/**
 * Who is the caller on this booking — the customer, the assigned mechanic, or
 * neither? Customer ownership is the shared `ownsBooking` predicate (the same
 * rule cancel/reschedule/review use, mirroring the bookings RLS policy);
 * mechanic membership is the assignment.
 */
export async function partyForBooking(
  bookingId: string,
  caller: BookingCaller,
): Promise<MessageParty> {
  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, customer_id, customer_email, customer_name, customer_phone, mechanic_id, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (!booking) return { ok: false, error: "That booking no longer exists." };

  const isMechanic = !!booking.mechanic_id && booking.mechanic_id === caller.userId;
  const isCustomer = !isMechanic && ownsBooking(booking, caller);
  if (!isCustomer && !isMechanic) {
    return { ok: false, error: "You're not part of this booking." };
  }

  return { ok: true, admin, booking, role: isMechanic ? "mechanic" : "customer" };
}

export async function sendMessageFor(
  bookingId: string,
  body: string,
  caller: BookingCaller,
): Promise<MessageResult> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Type a message first." };
  if (trimmed.length > MAX_MESSAGE_CHARS) return { ok: false, error: "That message is too long." };

  const party = await partyForBooking(bookingId, caller);
  if (!party.ok) return party;
  const { admin, booking, role } = party;

  if ((CLOSED_STATUSES as readonly string[]).includes(booking.status)) {
    return { ok: false, error: "This booking has finished, so its messages are closed." };
  }

  const { data: inserted, error } = await admin
    .from("messages")
    .insert({
      booking_id: bookingId,
      sender_id: caller.userId,
      sender_role: role,
      body: trimmed,
    })
    .select("id")
    .single();
  if (error) {
    // The database's own wording is for us, not the customer or mechanic.
    console.error("[messages] insert failed", bookingId, error.message);
    return { ok: false, error: "We couldn't send your message. Please try again." };
  }

  // Notify the customer of a mechanic's message: push to their phone, and the
  // SMS fallback when we hold a number. The unread-message sweep (cron) catches
  // everything else after ~5 min; stamping sms_notified_at on a successful SMS
  // keeps the sweep from double-texting the same message.
  if (role === "mechanic") {
    const { data: profile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", caller.userId)
      .maybeSingle();
    sendPushToCustomer(booking.customer_id, {
      title: `New message from ${shortPersonName(profile?.full_name)}`,
      body: trimmed.slice(0, 120),
      bookingId,
    }).catch(() => {});

    if (booking.customer_phone) {
      const smsBody = await renderSmsTemplate("message_fallback", {
        preview: trimmed.slice(0, 120),
      });
      const sent = await sendSms({ to: booking.customer_phone, body: smsBody }).catch(() => false);
      if (sent && inserted?.id) {
        await admin
          .from("messages")
          .update({ sms_notified_at: new Date().toISOString() })
          .eq("id", inserted.id);
      }
    }
  }

  // The other direction (Task 67): a customer's message reaches the mechanic's
  // phone at once, if they have the mechanic app. On its quiet `updates`
  // channel — `offers` is for the first-to-accept race — and `data.type` +
  // `bookingId` are what the app opens the thread from. A mechanic without the
  // app still hears through the unread-message sweep, as before.
  if (role === "customer") {
    sendPushToMechanic(booking.mechanic_id, {
      title: `New message from ${shortPersonName(booking.customer_name, "your customer")}`,
      body: trimmed.slice(0, 120),
      bookingId,
      data: { type: "message" },
      channelId: ANDROID_UPDATES_CHANNEL,
    }).catch(() => {});
  }

  // An audit row per message (Task 60). Two reasons it has to exist:
  //   • the customer's Inbox and its header dot are built from booking_events
  //     (lib/inbox/feed.ts), so without this a message never shows up as news —
  //     which was the gap Task 60 set out to close;
  //   • the admin live activity feed already renders `message_sent`
  //     (admin/(shell)/live/_components/activity-feed.tsx) and nothing had ever
  //     written one, so that branch was dead code.
  //
  // Written for BOTH directions, because the audit trail and the admin feed want
  // both. `from` is what lets the customer's Inbox show only the mechanic's
  // messages and not an echo of their own — see describeEvent in
  // lib/inbox/events.ts. The body is NOT stored here: `messages` already holds
  // it, and copying it into an append-only table would put the same words in a
  // second place with different deletion rules.
  await admin
    .from("booking_events")
    .insert({
      booking_id: bookingId,
      event_type: "message_sent",
      actor_id: caller.userId,
      payload: { from: role },
    })
    // Best-effort: the message is already sent, so a failed audit row must not
    // report failure back to whoever sent it.
    .then(({ error: eventError }) => {
      if (eventError) console.error("[messages] event insert failed", bookingId, eventError.message);
    });

  // Both web surfaces show the thread; they poll for new rows, these just keep
  // SSR copies fresh. The mechanic's Messages screen and the customer's Inbox
  // are SSR too, so they need the same treatment.
  revalidatePath(`/mechanic/jobs/${bookingId}/messages`);
  revalidatePath("/mechanic/messages");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/inbox");
  return { ok: true, id: inserted?.id as string | undefined };
}

/** Mark the counterpart's messages as read once the caller opens the thread. */
export async function markMessagesReadFor(
  bookingId: string,
  caller: BookingCaller,
): Promise<MessageResult> {
  const party = await partyForBooking(bookingId, caller);
  if (!party.ok) return party;
  const { admin, role } = party;
  const counterpart = role === "mechanic" ? "customer" : "mechanic";
  const { data: cleared } = await admin
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("booking_id", bookingId)
    .eq("sender_role", counterpart)
    .is("read_at", null)
    .select("id");

  // Only when something actually changed: this is called on every poll tick, so
  // revalidating unconditionally would throw away the shell's cache eight times
  // a minute for no reason.
  //
  // The mechanic's nav badge (Task 60) is computed in the shell layout, which is
  // SSR, so without this it keeps showing a count for messages already read —
  // and the thread itself marks them read, so the stale number is exactly what a
  // mechanic sees right after reading them.
  if (cleared?.length) {
    revalidatePath("/mechanic/messages");
    revalidatePath("/mechanic/jobs");
    revalidatePath("/dashboard/inbox");
  }
  return { ok: true, cleared: cleared?.length ?? 0 };
}
