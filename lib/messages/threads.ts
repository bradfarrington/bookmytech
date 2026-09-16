import type { SupabaseClient } from "@supabase/supabase-js";
import { CLOSED_STATUSES } from "./constants";

// The mechanic's message threads (Task 60). Until now a thread was reachable
// only by opening its job: the console had no Messages screen and no unread
// count, so a customer's question sat unseen unless the mechanic happened to
// open that job. On the customer side the equivalent gap was the Inbox, which
// never mentioned messages at all.
//
// Takes whichever Supabase client the caller holds, the same pattern as
// lib/disputes/list.ts. The mechanic pages pass their RLS-aware server client,
// so the `messages` SELECT policies (0019) decide what comes back and this
// needs no ownership filter of its own.
//
// One query per thread would be a query per job, so both reads are bulk: every
// message row on the mechanic's open jobs, grouped in memory. A mechanic has a
// handful of live jobs at a time, so this stays small.

export interface MessageThread {
  bookingId: string;
  jobNumber: number | null;
  repairDescription: string;
  vehicleReg: string | null;
  customerName: string | null;
  /** The newest message, whoever sent it. */
  lastBody: string;
  lastAt: string;
  lastFromCustomer: boolean;
  /** Customer messages this mechanic hasn't read. */
  unread: number;
}

interface BookingRow {
  id: string;
  job_number: number | null;
  repair_description: string | null;
  vehicle_reg: string | null;
  customer_name: string | null;
  status: string;
}

interface MessageRow {
  booking_id: string;
  body: string;
  sender_role: string;
  read_at: string | null;
  created_at: string;
}

/**
 * Threads on this mechanic's open jobs, the ones with unread messages first and
 * then the most recent.
 *
 * Closed jobs are left out: `sendMessageFor` refuses to post to a completed or
 * cancelled booking, so their threads are read-only history and belong on the
 * job, not in an inbox that implies a reply is possible.
 */
export async function loadMechanicThreads(
  client: SupabaseClient,
  mechanicId: string,
): Promise<MessageThread[]> {
  try {
    const { data: bookings, error: bookingsError } = await client
      .from("bookings")
      .select("id, job_number, repair_description, vehicle_reg, customer_name, status")
      .eq("mechanic_id", mechanicId)
      .not("status", "in", `(${CLOSED_STATUSES.join(",")})`);

    if (bookingsError) {
      console.error("[messages] thread bookings read failed", bookingsError.message);
      return [];
    }
    const open = (bookings ?? []) as BookingRow[];
    if (open.length === 0) return [];

    const { data: messages, error: messagesError } = await client
      .from("messages")
      .select("booking_id, body, sender_role, read_at, created_at")
      .in(
        "booking_id",
        open.map((b) => b.id),
      )
      .order("created_at", { ascending: false });

    if (messagesError) {
      console.error("[messages] thread messages read failed", messagesError.message);
      return [];
    }

    const byBooking = new Map<string, MessageRow[]>();
    for (const row of (messages ?? []) as MessageRow[]) {
      const list = byBooking.get(row.booking_id);
      if (list) list.push(row);
      else byBooking.set(row.booking_id, [row]);
    }

    const threads: MessageThread[] = [];
    for (const booking of open) {
      // Ordered newest-first by the query above, so [0] is the latest.
      const rows = byBooking.get(booking.id);
      if (!rows || rows.length === 0) continue; // a job nobody has messaged about

      const latest = rows[0];
      threads.push({
        bookingId: booking.id,
        jobNumber: booking.job_number,
        repairDescription: booking.repair_description?.trim() || "Vehicle repair",
        vehicleReg: booking.vehicle_reg,
        customerName: booking.customer_name,
        lastBody: latest.body,
        lastAt: latest.created_at,
        lastFromCustomer: latest.sender_role === "customer",
        unread: rows.filter((r) => r.sender_role === "customer" && !r.read_at).length,
      });
    }

    return sortThreads(threads);
  } catch (err) {
    console.error("[messages] threads load threw", err);
    return [];
  }
}

/** Anything waiting on the mechanic comes first; then newest activity. */
export function sortThreads(threads: MessageThread[]): MessageThread[] {
  return [...threads].sort((a, b) => {
    if ((a.unread > 0) !== (b.unread > 0)) return a.unread > 0 ? -1 : 1;
    return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime();
  });
}

/**
 * Unread customer messages across this mechanic's open jobs, for the nav badge.
 *
 * Counted with `head: true` so no rows come back — the badge needs the number
 * and nothing else. Returns 0 on any failure: a broken count must not take out
 * the shell that every mechanic page renders inside.
 */
export async function countUnreadMechanicMessages(
  client: SupabaseClient,
  mechanicId: string,
): Promise<number> {
  try {
    const { count } = await client
      .from("messages")
      .select("id, booking:bookings!inner(mechanic_id, status)", { count: "exact", head: true })
      .eq("booking.mechanic_id", mechanicId)
      .not("booking.status", "in", `(${CLOSED_STATUSES.join(",")})`)
      .eq("sender_role", "customer")
      .is("read_at", null);
    return count ?? 0;
  } catch {
    return 0;
  }
}
