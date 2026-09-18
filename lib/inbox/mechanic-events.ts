import { ESCALATION_HOURS, REASON_LABELS } from "@/lib/disputes/constants";
import { MECHANIC_DOC_LABEL, type MechanicDocType } from "@/lib/onboarding/docs";
import { daysUntil } from "@/lib/onboarding/expiry";
import { formatJobNumber, formatPrice, shortPersonName } from "@/lib/utils";

// What a MECHANIC is told in their Inbox, one item per thing that happened —
// the mechanic twin of ./events.ts, and the wording behind
// GET /api/mobile/v1/mechanic/inbox (Task 69). Pure, so mechanic-inbox.test.ts
// can pin it; ./mechanic-feed.ts does the reading.
//
// The same ALLOW-LIST rule as the customer's: the CRM writes many event types,
// and one that isn't worded here stays out of every mechanic's feed until it
// is. On top of that, a mechanic is never told about something they did
// themselves — accepting a job, sending a quote, starting a journey. The feed
// is news.

export type InboxTab = "messages" | "alerts" | "bmt";
export type InboxTone = "info" | "danger" | "success" | "warning" | "neutral";
export type InboxIcon =
  | "message"
  | "dispute"
  | "case"
  | "payout"
  | "review"
  | "document"
  | "calendar"
  | "quote"
  | "job"
  | "cancelled";

export type InboxLink =
  | { type: "thread" | "job"; id: string }
  | { type: "dispute" | "case"; id: string }
  | { type: "earnings" | "reviews" | "documents" };

export interface MechanicInboxItem {
  /** "<source>:<uuid>" — stable, and what read state stores. */
  id: string;
  tab: InboxTab;
  title: string;
  detail: string | null;
  /** "Job 04210 · Ford Focus"; null when it isn't about a job. */
  reference: string | null;
  at: string;
  unread: boolean;
  tone: InboxTone;
  icon: InboxIcon;
  /** A red dot rather than a blue one. */
  urgent: boolean;
  /** Set for a person: the app draws initials instead of an icon. */
  avatarName: string | null;
  link: InboxLink;
}

/** Everything but `unread`, which the feed adds from read state. */
export type InboxDraft = Omit<MechanicInboxItem, "unread">;

export interface JobRef {
  job_number: number | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
}

/** "Job 04210 · Ford Focus". */
export function jobReference(job: JobRef | null | undefined, extra?: string | null): string | null {
  if (!job) return null;
  const vehicle = [job.vehicle_make, job.vehicle_model].filter(Boolean).join(" ").trim();
  return [`Job ${formatJobNumber(job.job_number)}`, extra ?? (vehicle || null)].filter(Boolean).join(" · ");
}

// --- booking_events ---------------------------------------------------------

export interface MechanicEvent {
  id: string;
  booking_id: string;
  event_type: string;
  created_at: string;
  actor_id: string | null;
  actor_role: string | null;
  reason: string | null;
  payload: unknown;
}

interface EventWording {
  title: string;
  tone: InboxTone;
  icon: InboxIcon;
}

const EVENT_WORDING: Record<string, EventWording> = {
  reschedule_accepted: { title: "New time agreed", tone: "success", icon: "calendar" },
  reschedule_declined: { title: "New time declined", tone: "warning", icon: "calendar" },
  quote_approved: { title: "Quote approved", tone: "success", icon: "quote" },
  quote_declined: { title: "Quote declined", tone: "warning", icon: "quote" },
  quote_expired: { title: "Quote expired", tone: "neutral", icon: "quote" },
  revision_approved: { title: "Revised job approved", tone: "success", icon: "job" },
  revision_declined: { title: "Revised job declined", tone: "warning", icon: "job" },
  revision_expired: { title: "Revised job expired", tone: "neutral", icon: "job" },
  cancelled: { title: "Job cancelled", tone: "danger", icon: "cancelled" },
  mechanic_reassigned: { title: "Job moved to another mechanic", tone: "warning", icon: "cancelled" },
  dispute_escalated: { title: "Dispute passed to Book My Tech", tone: "warning", icon: "dispute" },
  dispute_resolved: { title: "Dispute resolved", tone: "info", icon: "dispute" },
  payment_refunded: { title: "Refund issued to the customer", tone: "warning", icon: "payout" },
};

/** Every event type `describeMechanicEvent` can word: the server-side filter. */
export const MECHANIC_EVENT_TYPES = Object.keys(EVENT_WORDING);

/** One feed item for this event, or null when it isn't this mechanic's news. */
export function describeMechanicEvent(event: MechanicEvent, mechanicId: string, job: JobRef | null): InboxDraft | null {
  const wording = EVENT_WORDING[event.event_type];
  if (!wording) return null;
  // Never what they did themselves: their own withdrawn dispute, their own
  // cancellation, their own escalation.
  if (event.actor_id === mechanicId || event.actor_role === "mechanic") return null;

  const payload = (event.payload ?? null) as Record<string, unknown> | null;
  let { title } = wording;
  let link: InboxLink = { type: "job", id: event.booking_id };
  let detail = event.reason?.trim() || null;

  if (event.event_type === "mechanic_reassigned") {
    // The same event is written for the mechanic GAINING the job; only the one
    // losing it is told here (the other got an offer, or the admin's call).
    if (payload?.previous_mechanic_id !== mechanicId) return null;
    detail = null;
  }
  if (event.event_type === "cancelled") {
    title = event.actor_role === "customer" ? "The customer cancelled" : "Job cancelled by Book My Tech";
  }
  if (event.event_type === "dispute_escalated" || event.event_type === "dispute_resolved") {
    if (typeof payload?.dispute_id === "string") link = { type: "dispute", id: payload.dispute_id };
  }
  if (event.event_type === "payment_refunded" && typeof payload?.amount_pence === "number") {
    detail = [formatPrice(payload.amount_pence), detail].filter(Boolean).join(" · ");
  }

  return {
    id: `event:${event.id}`,
    tab: "alerts",
    title,
    detail,
    reference: jobReference(job),
    at: event.created_at,
    tone: wording.tone,
    icon: wording.icon,
    urgent: false,
    avatarName: null,
    link,
  };
}

// --- disputes ---------------------------------------------------------------

export interface FeedDispute {
  id: string;
  status: string;
  opened_by_role: string;
  reason_category: string;
  created_at: string;
  responded_at: string | null;
}

/** "BMT steps in in 47h" — while the parties still have the floor. Null otherwise. */
export function escalationClock(d: Pick<FeedDispute, "status" | "created_at" | "responded_at">, now: Date = new Date()): string | null {
  const from = d.status === "opened" ? d.created_at : d.status === "responded" ? (d.responded_at ?? d.created_at) : null;
  if (!from) return null;
  const hours = Math.ceil((new Date(from).getTime() + ESCALATION_HOURS * 3_600_000 - now.getTime()) / 3_600_000);
  return hours > 0 ? `BMT steps in in ${hours}h` : "BMT is stepping in";
}

export function describeDispute(d: FeedDispute, job: JobRef & { customer_name?: string | null }, now: Date = new Date()): InboxDraft {
  const open = d.status !== "resolved" && d.status !== "withdrawn";
  const closedNote = d.status === "resolved" ? "Resolved" : d.status === "withdrawn" ? "Withdrawn" : null;
  const clock = escalationClock(d, now) ?? (d.status === "escalated" ? "With Book My Tech" : closedNote);
  return {
    id: `dispute:${d.id}`,
    tab: "alerts",
    title:
      d.opened_by_role === "customer"
        ? `Dispute opened by ${shortPersonName(job.customer_name, "the customer")}`
        : "Issue you raised",
    detail: REASON_LABELS[d.reason_category] ?? d.reason_category,
    reference: jobReference(job, clock),
    at: d.created_at,
    tone: open ? "danger" : "neutral",
    icon: "dispute",
    urgent: open,
    avatarName: null,
    link: { type: "dispute", id: d.id },
  };
}

// --- payouts ----------------------------------------------------------------

export function describeLedgerEntry(
  row: { id: string; entry_type: string; amount_pence: number; description: string | null; created_at: string },
  job: JobRef | null,
): InboxDraft | null {
  const amount = formatPrice(Math.abs(row.amount_pence));
  const isPayout = row.entry_type === "payout";
  if (!isPayout && row.entry_type !== "refund_clawback") return null;
  return {
    id: `payout:${row.id}`,
    tab: "alerts",
    title: isPayout ? `Payout sent · ${amount}` : `${amount} taken back for a refund`,
    detail: row.description?.trim() || null,
    reference: jobReference(job),
    at: row.created_at,
    tone: isPayout ? "success" : "warning",
    icon: "payout",
    urgent: false,
    avatarName: null,
    link: { type: "earnings" },
  };
}

/** The push a payout sends says the same thing the feed will. */
export function payoutTitle(pence: number): string {
  return `Payout sent · ${formatPrice(pence)}`;
}

// --- reviews ----------------------------------------------------------------

export function reviewTitle(customerName: string | null | undefined, rating: number): string {
  return `${shortPersonName(customerName, "A customer")} left a ${rating}-star review`;
}

export function describeReview(
  row: { id: string; rating: number; comment: string | null; created_at: string },
  job: (JobRef & { customer_name?: string | null }) | null,
): InboxDraft {
  return {
    id: `review:${row.id}`,
    tab: "alerts",
    title: reviewTitle(job?.customer_name, row.rating),
    detail: row.comment?.trim() || null,
    reference: jobReference(job),
    at: row.created_at,
    tone: row.rating >= 4 ? "success" : row.rating >= 3 ? "neutral" : "warning",
    icon: "review",
    urgent: false,
    avatarName: shortPersonName(job?.customer_name, "") || null,
    link: { type: "reviews" },
  };
}

// --- documents --------------------------------------------------------------

export const DOCUMENT_NOTICE_DAYS = 30;
export const DOCUMENT_URGENT_DAYS = 14;

/**
 * The current row for each `doc_type` — the newest upload — and nothing else.
 *
 * A replacement document is a NEW ROW, never an update: `mechanic_documents`
 * has no unique key on (mechanic_id, doc_type) and the object path carries a
 * timestamp, so the newest row per type is the current one and older rows are
 * history. Every other surface already reads it that way — the Documents screen
 * lists newest first, and the grace sweep counts a type as supplied the moment
 * a `pending_review` row exists — so the Inbox does too. Without this it keeps
 * saying "has expired" about a document the mechanic has already replaced,
 * because the replacement is still in review and the old row is still expired.
 *
 * A null `uploaded_at` sorts oldest, so a row that somehow has none can never
 * displace a real one. The id breaks a tie so the answer is stable.
 */
export function currentDocumentPerType<
  T extends { id: string; doc_type: string; uploaded_at: string | null },
>(rows: readonly T[]): T[] {
  const newest = new Map<string, T>();
  for (const row of rows) {
    const held = newest.get(row.doc_type);
    if (!held || isNewer(row, held)) newest.set(row.doc_type, row);
  }
  return [...newest.values()];
}

function isNewer(
  a: { id: string; uploaded_at: string | null },
  b: { id: string; uploaded_at: string | null },
): boolean {
  const at = a.uploaded_at ? Date.parse(a.uploaded_at) : Number.NEGATIVE_INFINITY;
  const bt = b.uploaded_at ? Date.parse(b.uploaded_at) : Number.NEGATIVE_INFINITY;
  if (at !== bt) return at > bt;
  return a.id > b.id;
}

/**
 * A document that needs the mechanic: rejected, expired, or within 30 days of
 * expiring. `at` is when it BECAME this news — the 30-day mark, the 14-day
 * mark, the expiry date, the review — so a document that turns urgent is news
 * again after "Mark all read".
 */
export function describeDocument(
  row: { id: string; doc_type: string; status: string; expires_at: string | null; reviewed_at: string | null; updated_at: string | null },
  now: Date = new Date(),
): InboxDraft | null {
  const label = MECHANIC_DOC_LABEL[row.doc_type as MechanicDocType] ?? "A document";
  const base = { id: `document:${row.id}`, tab: "bmt" as const, reference: null, icon: "document" as const, avatarName: null, link: { type: "documents" as const } };
  const daysBefore = (n: number) => new Date(new Date(`${row.expires_at}T00:00:00Z`).getTime() - n * 86_400_000).toISOString();

  if (row.status === "rejected") {
    return { ...base, title: `${label} wasn't accepted`, detail: "Upload a new copy to stay online.", at: row.reviewed_at ?? row.updated_at ?? now.toISOString(), tone: "danger", urgent: true };
  }
  const left = daysUntil(row.expires_at, now.getTime());
  if (row.status === "expired" || (left != null && left < 0 && row.status === "verified")) {
    return { ...base, title: `${label} has expired`, detail: "Upload a new copy to get back online.", at: row.expires_at ? daysBefore(0) : (row.updated_at ?? now.toISOString()), tone: "danger", urgent: true };
  }
  if (row.status !== "verified" || left == null || left > DOCUMENT_NOTICE_DAYS) return null;
  const urgent = left <= DOCUMENT_URGENT_DAYS;
  return {
    ...base,
    title: left === 0 ? `${label} expires today` : `${label} expires in ${left} day${left === 1 ? "" : "s"}`,
    detail: "Upload the renewed copy before it runs out.",
    at: daysBefore(urgent ? DOCUMENT_URGENT_DAYS : DOCUMENT_NOTICE_DAYS),
    tone: urgent ? "danger" : "warning",
    urgent,
  };
}

// --- ids --------------------------------------------------------------------

/** The ids read state may store. `thread:` is absent on purpose: its unread state is `messages.read_at`. */
export const READABLE_ITEM_ID = /^(event|dispute|payout|review|document|case):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
