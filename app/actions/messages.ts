"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms/send-sms";
import { renderSmsTemplate } from "@/lib/sms/render-template";

export type MessageResult = { ok: true } | { ok: false; error: string };

// In-app messaging between a customer and their assigned mechanic (Task 09
// Stage 2). Reads happen client-side under RLS; writes go through here so we can
// stamp the sender role, keep the booking-party check server-side, and fire the
// SMS fallback — same privileged-write pattern as the other booking actions.

// Resolve who the caller is on this booking: the customer, the assigned
// mechanic, or neither. Returns the role + the counterpart's contact for the
// SMS fallback.
async function partyForBooking(bookingId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from("bookings")
    .select("id, customer_id, customer_email, customer_phone, mechanic_id, status")
    .eq("id", bookingId)
    .single();
  if (!booking) return { ok: false as const, error: "That booking no longer exists." };

  const isCustomer =
    booking.customer_id === user.id ||
    (!booking.customer_id && booking.customer_email === user.email);
  const isMechanic = booking.mechanic_id === user.id;
  if (!isCustomer && !isMechanic)
    return { ok: false as const, error: "You're not part of this booking." };

  return {
    ok: true as const,
    admin,
    booking,
    userId: user.id,
    role: (isMechanic ? "mechanic" : "customer") as "mechanic" | "customer",
  };
}

export async function sendMessage(
  bookingId: string,
  body: string,
): Promise<MessageResult> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Type a message first." };
  if (trimmed.length > 2000) return { ok: false, error: "That message is too long." };

  const party = await partyForBooking(bookingId);
  if (!party.ok) return party;

  const { admin, booking, userId, role } = party;

  const { data: inserted, error } = await admin
    .from("messages")
    .insert({
      booking_id: bookingId,
      sender_id: userId,
      sender_role: role,
      body: trimmed,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  // SMS fallback. We immediately nudge a mechanic→customer message when we hold
  // a number; the unread-message sweep (cron) catches everything else after
  // ~5 min. Stamp sms_notified_at on a successful send so the sweep never
  // double-texts the same message.
  if (role === "mechanic" && booking.customer_phone) {
    const body = await renderSmsTemplate("message_fallback", {
      preview: trimmed.slice(0, 120),
    });
    const sent = await sendSms({ to: booking.customer_phone, body }).catch(() => false);
    if (sent && inserted?.id) {
      await admin
        .from("messages")
        .update({ sms_notified_at: new Date().toISOString() })
        .eq("id", inserted.id);
    }
  }

  // Both surfaces show the thread; realtime delivers the new row, these just
  // keep SSR copies fresh.
  revalidatePath(`/mechanic/jobs/${bookingId}/messages`);
  revalidatePath("/dashboard");
  return { ok: true };
}

// Mark the counterpart's messages as read once the caller opens the thread.
export async function markMessagesRead(bookingId: string): Promise<MessageResult> {
  const party = await partyForBooking(bookingId);
  if (!party.ok) return party;
  const { admin, role } = party;
  const counterpart = role === "mechanic" ? "customer" : "mechanic";
  await admin
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("booking_id", bookingId)
    .eq("sender_role", counterpart)
    .is("read_at", null);
  return { ok: true };
}
