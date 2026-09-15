import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingTable } from "@/lib/supabase/errors";
import { CUSTOMER_EVENT_TYPES, REMINDER_TITLES, describeEvent, type CustomerEvent } from "./events";
import { EMPTY_READ_STATE, readStateFromRow, type ReadState } from "./read-state";

// The Inbox feed on the website (Task 52), assembled exactly as the app does
// (src/lib/inbox.ts): the customer's booking events and the reminders sent to
// them, newest first, through the CALLER'S client so RLS scopes both tables to
// them (guest bookings and reminders made with the same email included).

export type InboxKind = "booking" | "reminder";

export interface InboxItem {
  /** "event:<uuid>" or "reminder:<uuid>": the ids read state stores. */
  id: string;
  kind: InboxKind;
  title: string;
  detail: string | null;
  at: string;
  /** The event type or reminder type: picks the icon. */
  type: string;
  /** For a status_changed event, the status it moved to. */
  status: string | null;
  bookingId: string | null;
  vehicleReg: string | null;
}

export const FEED_LIMIT = 60;

type EventRow = CustomerEvent & {
  booking_id: string;
  bookings: { repair_description: string | null } | Array<{ repair_description: string | null }> | null;
};

export type InboxResult =
  | { ok: true; items: InboxItem[]; readState: ReadState; readStateStored: boolean }
  | { ok: false; error: string };

export async function loadInbox(db: SupabaseClient): Promise<InboxResult> {
  const [events, reminders, reads] = await Promise.all([
    db
      .from("booking_events")
      .select("id, event_type, created_at, reason, payload, booking_id, bookings(repair_description)")
      .in("event_type", CUSTOMER_EVENT_TYPES)
      .order("created_at", { ascending: false })
      .limit(FEED_LIMIT),
    db
      .from("reminder_schedules")
      .select("id, reminder_type, sent_at, vehicle_reg")
      .not("sent_at", "is", null)
      .order("sent_at", { ascending: false })
      .limit(FEED_LIMIT),
    db.from("customer_inbox_reads").select("read_before, read_ids").maybeSingle(),
  ]);

  // Booking news is most of the feed, so only that failing counts as failing.
  if (events.error) {
    console.error("[inbox] events read failed", events.error.message);
    return { ok: false, error: "We couldn't load your notifications. Please try again." };
  }

  const items: InboxItem[] = [];
  for (const row of (events.data ?? []) as unknown as EventRow[]) {
    const title = describeEvent(row);
    if (!title) continue;
    const booking = Array.isArray(row.bookings) ? row.bookings[0] : row.bookings;
    const payload = row.payload as { status_to?: unknown } | null;
    items.push({
      id: `event:${row.id}`,
      kind: "booking",
      title,
      detail: [booking?.repair_description?.trim(), row.reason?.trim()].filter(Boolean).join(" · ") || null,
      at: row.created_at,
      type: row.event_type,
      status: typeof payload?.status_to === "string" ? payload.status_to : null,
      bookingId: row.booking_id,
      vehicleReg: null,
    });
  }

  for (const row of (reminders.data ?? []) as Array<{
    id: string;
    reminder_type: string;
    sent_at: string | null;
    vehicle_reg: string | null;
  }>) {
    const title = REMINDER_TITLES[row.reminder_type];
    if (!title || !row.sent_at) continue;
    items.push({
      id: `reminder:${row.id}`,
      kind: "reminder",
      title,
      detail: row.vehicle_reg,
      at: row.sent_at,
      type: row.reminder_type,
      status: null,
      bookingId: null,
      vehicleReg: row.vehicle_reg,
    });
  }

  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const readStateStored = !reads.error || !isMissingTable(reads.error);
  if (reads.error && !isMissingTable(reads.error)) {
    console.error("[inbox] read state read failed", reads.error.message);
  }
  const readState = reads.error
    ? EMPTY_READ_STATE
    : readStateFromRow(reads.data as { read_before: string | null; read_ids: string[] | null } | null);

  return { ok: true, items: items.slice(0, FEED_LIMIT), readState, readStateStored };
}

/** Mark one item read, through the caller's client. Quietly does nothing before 0075. */
export async function markInboxItemRead(db: SupabaseClient, itemId: string): Promise<void> {
  if (!/^(event|reminder):[0-9a-f-]{36}$/i.test(itemId)) return;
  const { error } = await db.rpc("mark_inbox_item_read", { p_item_id: itemId });
  if (error && error.code !== "PGRST202") console.error("[inbox] mark read failed", error.message);
}

export async function markInboxAllRead(db: SupabaseClient): Promise<void> {
  const { error } = await db.rpc("mark_inbox_all_read");
  if (error && error.code !== "PGRST202") console.error("[inbox] mark all read failed", error.message);
}
