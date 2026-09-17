import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingFunction, isMissingTable } from "@/lib/supabase/errors";
import { loadMechanicThreads } from "@/lib/messages/threads";
import { RESOLUTION_STATUS_LABELS, type ResolutionStatus } from "@/lib/resolutions/constants";
import { FEED_LIMIT } from "./feed";
import {
  MECHANIC_EVENT_TYPES,
  READABLE_ITEM_ID,
  describeDispute,
  describeDocument,
  describeLedgerEntry,
  describeMechanicEvent,
  describeReview,
  jobReference,
  type FeedDispute,
  type InboxDraft,
  type JobRef,
  type MechanicEvent,
  type MechanicInboxItem,
} from "./mechanic-events";
import { EMPTY_READ_STATE, isUnread, readStateFromRow, type ReadState } from "./read-state";

// The mechanic app's Inbox (GET /api/mobile/v1/mechanic/inbox, Task 69): one
// feed from seven sources, newest first. The mechanic twin of ./feed.ts.
//
// Unlike the customer's feed this is assembled on the SERVICE ROLE, scoped to
// `mechanicId` in every query, rather than through the caller's own client. Two
// of the things a mechanic most needs to hear are about jobs that are no longer
// theirs — a customer's cancellation is readable, but a job reassigned away
// from them is not, the moment it happens — and RLS would hide exactly those.
//
// There is no notifications table. Every item is derived from what already
// exists; the only thing stored is where they have read up to
// (`mechanic_inbox_reads`, 0085), and the rules for that are the customer's
// (./read-state.ts): "Mark all read" sets an instant, single items are
// remembered by id, and anything over seven days old counts as read. A message
// thread is the exception — it is unread while it holds unread messages
// (`messages.read_at`), whatever the read state says.
//
// Each source fails SOFT, to nothing: a table that hasn't been migrated yet
// (the Resolution Center's, 0085's) must not take the whole Inbox down.

type Admin = ReturnType<typeof createAdminClient>;

const JOB_COLUMNS = "id, job_number, vehicle_make, vehicle_model, customer_name, mechanic_id";
type Job = JobRef & { id: string; customer_name: string | null; mechanic_id: string | null };

function one<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

async function soft<T>(source: string, load: () => Promise<T[]>): Promise<T[]> {
  try {
    return await load();
  } catch (err) {
    console.error(`[mechanic-inbox] ${source} failed`, err);
    return [];
  }
}

function check(error: { code?: string; message?: string } | null): void {
  if (error && !isMissingTable(error)) throw new Error(error.message);
}

async function threadItems(admin: Admin, mechanicId: string): Promise<MechanicInboxItem[]> {
  const threads = await loadMechanicThreads(admin, mechanicId);
  return threads.map((t) => ({
    id: `thread:${t.bookingId}`,
    tab: "messages",
    title: t.customerName?.trim() || "Your customer",
    detail: t.lastFromCustomer ? t.lastBody : `You: ${t.lastBody}`,
    reference: jobReference({ job_number: t.jobNumber }, t.vehicleReg ?? t.repairDescription),
    at: t.lastAt,
    unread: t.unread > 0,
    tone: "info",
    icon: "message",
    urgent: false,
    avatarName: t.customerName?.trim() || null,
    link: { type: "thread", id: t.bookingId },
  }));
}

async function disputeDrafts(admin: Admin, mechanicId: string, now: Date): Promise<InboxDraft[]> {
  const { data, error } = await admin
    .from("disputes")
    .select(`id, status, opened_by_role, reason_category, created_at, responded_at, booking:bookings!inner(${JOB_COLUMNS})`)
    .eq("booking.mechanic_id", mechanicId)
    .order("created_at", { ascending: false })
    .limit(FEED_LIMIT);
  check(error);
  return (data ?? []).flatMap((row) => {
    const job = one(row.booking as unknown as Job | Job[]);
    return job ? [describeDispute(row as unknown as FeedDispute, job, now)] : [];
  });
}

async function eventDrafts(admin: Admin, mechanicId: string): Promise<InboxDraft[]> {
  const columns = `id, booking_id, event_type, created_at, actor_id, actor_role, reason, payload, booking:bookings!inner(${JOB_COLUMNS})`;
  const [mine, movedAway] = await Promise.all([
    admin
      .from("booking_events")
      .select(columns)
      .eq("booking.mechanic_id", mechanicId)
      .in("event_type", MECHANIC_EVENT_TYPES)
      .order("created_at", { ascending: false })
      .limit(FEED_LIMIT),
    // A job reassigned AWAY from them no longer names them on the booking; the
    // event does.
    admin
      .from("booking_events")
      .select(columns)
      .eq("event_type", "mechanic_reassigned")
      .eq("payload->>previous_mechanic_id", mechanicId)
      .order("created_at", { ascending: false })
      .limit(FEED_LIMIT),
  ]);
  check(mine.error);
  check(movedAway.error);

  const seen = new Set<string>();
  const drafts: InboxDraft[] = [];
  for (const row of [...(mine.data ?? []), ...(movedAway.data ?? [])]) {
    if (seen.has(row.id as string)) continue;
    seen.add(row.id as string);
    const draft = describeMechanicEvent(row as unknown as MechanicEvent, mechanicId, one(row.booking as unknown as Job | Job[]));
    if (draft) drafts.push(draft);
  }
  return drafts;
}

async function ledgerDrafts(admin: Admin, mechanicId: string): Promise<InboxDraft[]> {
  const { data, error } = await admin
    .from("mechanic_ledger")
    .select(`id, entry_type, amount_pence, description, created_at, booking:bookings(${JOB_COLUMNS})`)
    .eq("mechanic_id", mechanicId)
    .in("entry_type", ["payout", "refund_clawback"])
    .order("created_at", { ascending: false })
    .limit(FEED_LIMIT);
  check(error);
  return (data ?? []).flatMap((row) => {
    const draft = describeLedgerEntry(row as never, one(row.booking as unknown as Job | Job[]));
    return draft ? [draft] : [];
  });
}

async function reviewDrafts(admin: Admin, mechanicId: string): Promise<InboxDraft[]> {
  const { data, error } = await admin
    .from("reviews")
    .select(`id, rating, comment, created_at, booking:bookings(${JOB_COLUMNS})`)
    .eq("mechanic_id", mechanicId)
    .order("created_at", { ascending: false })
    .limit(FEED_LIMIT);
  check(error);
  return (data ?? []).map((row) => describeReview(row as never, one(row.booking as unknown as Job | Job[])));
}

async function documentDrafts(admin: Admin, mechanicId: string, now: Date): Promise<InboxDraft[]> {
  const { data, error } = await admin
    .from("mechanic_documents")
    .select("id, doc_type, status, expires_at, reviewed_at, updated_at")
    .eq("mechanic_id", mechanicId)
    .in("status", ["verified", "rejected", "expired"]);
  check(error);
  return (data ?? []).flatMap((row) => {
    const draft = describeDocument(row as never, now);
    return draft ? [draft] : [];
  });
}

/** A case is unread while Book My Tech has had the last word, so it carries that with it. */
async function caseDrafts(admin: Admin, mechanicId: string): Promise<Array<InboxDraft & { adminSpokeLast: boolean }>> {
  const { data: cases, error } = await admin
    .from("resolution_cases")
    .select(`id, status, reason_label, created_at, booking:bookings(${JOB_COLUMNS})`)
    .eq("mechanic_id", mechanicId)
    .order("created_at", { ascending: false })
    .limit(FEED_LIMIT);
  check(error);
  if (!cases?.length) return [];

  const { data: messages, error: messagesError } = await admin
    .from("resolution_messages")
    .select("case_id, sender_role, body, created_at")
    .in("case_id", cases.map((c) => c.id as string))
    .order("created_at", { ascending: false });
  check(messagesError);
  const latest = new Map<string, { sender_role: string; body: string; created_at: string }>();
  for (const m of messages ?? []) if (!latest.has(m.case_id as string)) latest.set(m.case_id as string, m as never);

  return cases.map((c) => {
    const last = latest.get(c.id as string) ?? null;
    const adminSpokeLast = last?.sender_role === "admin";
    const closed = c.status === "resolved" || c.status === "closed";
    return {
      id: `case:${c.id}`,
      tab: "bmt" as const,
      title: c.reason_label as string,
      detail: adminSpokeLast ? last!.body : (RESOLUTION_STATUS_LABELS[c.status as ResolutionStatus] ?? (c.status as string)),
      reference: jobReference(one(c.booking as unknown as Job | Job[])),
      at: last?.created_at ?? (c.created_at as string),
      tone: closed ? ("neutral" as const) : ("info" as const),
      icon: "case" as const,
      urgent: false,
      avatarName: null,
      link: { type: "case" as const, id: c.id as string },
      adminSpokeLast,
    };
  });
}

async function readStateFor(admin: Admin, mechanicId: string): Promise<ReadState> {
  const { data, error } = await admin
    .from("mechanic_inbox_reads")
    .select("read_before, read_ids")
    .eq("mechanic_id", mechanicId)
    .maybeSingle();
  if (error) {
    if (!isMissingTable(error)) console.error("[mechanic-inbox] read state failed", error.message);
    return EMPTY_READ_STATE;
  }
  return readStateFromRow(data as { read_before: string | null; read_ids: string[] | null } | null);
}

export interface MechanicInbox {
  unreadCount: number;
  items: MechanicInboxItem[];
}

export async function loadMechanicInbox(mechanicId: string, now: Date = new Date()): Promise<MechanicInbox> {
  const admin = createAdminClient();
  const [threads, disputes, events, ledger, reviews, documents, cases, readState] = await Promise.all([
    soft("threads", () => threadItems(admin, mechanicId)),
    soft("disputes", () => disputeDrafts(admin, mechanicId, now)),
    soft("events", () => eventDrafts(admin, mechanicId)),
    soft("payouts", () => ledgerDrafts(admin, mechanicId)),
    soft("reviews", () => reviewDrafts(admin, mechanicId)),
    soft("documents", () => documentDrafts(admin, mechanicId, now)),
    soft("cases", () => caseDrafts(admin, mechanicId)),
    readStateFor(admin, mechanicId),
  ]);

  const items: MechanicInboxItem[] = [
    ...threads,
    ...[...disputes, ...events, ...ledger, ...reviews, ...documents].map((d) => ({ ...d, unread: isUnread(d, readState, now) })),
    // Their own reply is never news, however recent.
    ...cases.map(({ adminSpokeLast, ...d }) => ({ ...d, unread: adminSpokeLast && isUnread(d, readState, now) })),
  ];
  items.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  // Counted before the cap: an unread item that has scrolled off the end of
  // the feed is still unread.
  return { unreadCount: items.filter((i) => i.unread).length, items: items.slice(0, FEED_LIMIT) };
}

/**
 * Mark one item read, as the CALLER (their own client, so `auth.uid()` is
 * them): the two functions in 0085 only ever touch the caller's own row. A
 * `thread:` id is accepted and does nothing — reading the thread is what clears
 * it. Quietly does nothing before 0085.
 */
export async function markMechanicInboxItemRead(db: SupabaseClient, itemId: string): Promise<void> {
  if (!READABLE_ITEM_ID.test(itemId)) return;
  const { error } = await db.rpc("mark_mechanic_inbox_item_read", { p_item_id: itemId });
  if (error && !isMissingFunction(error)) console.error("[mechanic-inbox] mark read failed", error.message);
}

export async function markMechanicInboxAllRead(db: SupabaseClient): Promise<void> {
  const { error } = await db.rpc("mark_mechanic_inbox_all_read");
  if (error && !isMissingFunction(error)) console.error("[mechanic-inbox] mark all read failed", error.message);
}
