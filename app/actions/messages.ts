"use server";

import { createClient } from "@/lib/supabase/server";
import {
  markMessagesReadFor,
  sendMessageFor,
  type MessageResult,
} from "@/lib/messages/send";
import type { BookingCaller } from "@/lib/bookings/ownership";

export type { MessageResult } from "@/lib/messages/send";

// In-app messaging between a customer and their assigned mechanic (Task 09
// Stage 2). Reads happen client-side under RLS; writes go through here so we can
// stamp the sender role, keep the booking-party check server-side, and fire the
// push + SMS fallback.
//
// These are thin wrappers: the implementation is lib/messages/send.ts, shared
// with the mobile route POST /api/mobile/v1/bookings/:id/messages. The caller
// is resolved HERE from the cookie session and is deliberately not a parameter
// of these exports — every export of a "use server" file is browser-reachable
// with arguments of the caller's choosing.

async function cookieCaller(): Promise<BookingCaller | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return { userId: user.id, email: user.email ?? null };
}

export async function sendMessage(
  bookingId: string,
  body: string,
): Promise<MessageResult> {
  const caller = await cookieCaller();
  if (!caller) return { ok: false, error: "Not signed in." };
  return sendMessageFor(bookingId, body, caller);
}

// Mark the counterpart's messages as read once the caller opens the thread.
export async function markMessagesRead(bookingId: string): Promise<MessageResult> {
  const caller = await cookieCaller();
  if (!caller) return { ok: false, error: "Not signed in." };
  return markMessagesReadFor(bookingId, caller);
}
