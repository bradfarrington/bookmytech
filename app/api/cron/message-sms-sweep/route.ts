import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms/send-sms";

// Unread-message SMS sweep (Task 13 Stage B).
//
// Nudges the recipient of any in-app message that's still unread ~5 minutes
// after it was sent and hasn't already been SMS'd (the immediate
// mechanic→customer fallback in sendMessage stamps sms_notified_at). Runs every
// 5 minutes; unread messages from a mechanic nudge the customer, and vice
// versa. Multiple unread messages in one booking collapse into a single nudge
// to save credits. Every processed message is stamped so the queue never wedges
// and the same message is never texted twice.
//
// Protected by CRON_SECRET when set. Next API route + vercel.json cron, not a
// Supabase edge function (project convention).

const BATCH = 200;
const STALE_MINUTES = 5;

interface MessageRow {
  id: string;
  booking_id: string;
  sender_role: "customer" | "mechanic";
}

async function runSweep() {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60_000).toISOString();

  const { data: messages } = await admin
    .from("messages")
    .select("id, booking_id, sender_role")
    .is("read_at", null)
    .is("sms_notified_at", null)
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(BATCH);

  if (!messages?.length) return { nudged: 0, stamped: 0 };

  // Group by (booking, recipient role) so each recipient gets at most one nudge.
  // recipient = the party who did NOT send.
  const groups = new Map<string, { bookingId: string; recipient: "customer" | "mechanic"; ids: string[] }>();
  for (const m of messages as MessageRow[]) {
    const recipient = m.sender_role === "mechanic" ? "customer" : "mechanic";
    const key = `${m.booking_id}:${recipient}`;
    const g = groups.get(key) ?? { bookingId: m.booking_id, recipient, ids: [] };
    g.ids.push(m.id);
    groups.set(key, g);
  }

  // Resolve recipient phones: customers use bookings.customer_phone; mechanics
  // use their profile phone.
  const bookingIds = [...new Set([...groups.values()].map((g) => g.bookingId))];
  const { data: bookings } = await admin
    .from("bookings")
    .select("id, customer_phone, mechanic_id")
    .in("id", bookingIds);
  const bookingById = new Map((bookings ?? []).map((b) => [b.id, b]));

  const mechanicIds = [
    ...new Set((bookings ?? []).map((b) => b.mechanic_id).filter(Boolean)),
  ] as string[];
  const mechPhoneById = new Map<string, string | null>();
  if (mechanicIds.length) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, phone")
      .in("id", mechanicIds);
    for (const p of profiles ?? []) mechPhoneById.set(p.id, p.phone);
  }

  let nudged = 0;
  let stamped = 0;
  for (const g of groups.values()) {
    const booking = bookingById.get(g.bookingId);
    const phone =
      g.recipient === "customer"
        ? booking?.customer_phone ?? null
        : booking?.mechanic_id
          ? mechPhoneById.get(booking.mechanic_id) ?? null
          : null;

    if (phone) {
      const sent = await sendSms({
        to: phone,
        body: "You have an unread message on your Book My Tech booking. Open your dashboard to reply.",
      }).catch(() => false);
      if (sent) nudged += 1;
    }

    // Stamp every message in the group regardless of outcome so the queue never
    // wedges (mirrors the reminder sender's sent_at stamping). A no-phone or
    // transient-failure recipient simply doesn't get this courtesy nudge.
    const { error } = await admin
      .from("messages")
      .update({ sms_notified_at: new Date().toISOString() })
      .in("id", g.ids);
    if (!error) stamped += g.ids.length;
  }

  return { nudged, stamped };
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  }

  try {
    const result = await runSweep();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("message-sms-sweep failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "sweep failed" },
      { status: 500 },
    );
  }
}
