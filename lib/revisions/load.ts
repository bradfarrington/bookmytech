import type { SupabaseClient } from "@supabase/supabase-js";
import type { RevisionDiff } from "./diff";
import { parseSnapshot, type RevisionLine, type RevisionPart, type RevisionSnapshot } from "./snapshot";
import { isRevisionExpired, type RevisionStatus } from "./status";

// Reads revisions for a booking into plain, serialisable views (Task 37).
// Every surface — the mechanic's job page, the customer's dashboard and
// approval page, the admin's job page, the mobile GET — goes through this.
// Fails open to [] before 0064 exists or on any error.

export interface RevisionView {
  id: string;
  bookingId: string;
  mechanicId: string;
  status: RevisionStatus;
  reason: string;
  note: string | null;
  before: RevisionSnapshot;
  after: RevisionSnapshot;
  differencePence: number;
  holdQuoteId: string | null;
  sentAt: string | null;
  respondedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export const REVISION_COLUMNS =
  "id, booking_id, mechanic_id, status, reason, note, before, after, after_repair_ids, before_total_pence, after_total_pence, difference_pence, hold_quote_id, sent_at, responded_at, expires_at, created_at";

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const EMPTY: RevisionSnapshot = {
  repairIds: [],
  lines: [],
  parts: [],
  repairDescription: "Vehicle repair",
  serviceDurationHours: 1,
  rawHours: null,
  combineSource: null,
  oil: null,
  hourlyRatePence: 0,
  commissionRate: 0.15,
  basePricePence: 0,
  partsPricePence: 0,
  totalPence: 0,
  platformFeePence: 0,
  mechanicPayoutPence: 0,
};

export function toRevisionView(row: Row): RevisionView {
  return {
    id: String(row.id),
    bookingId: String(row.booking_id),
    mechanicId: String(row.mechanic_id),
    status: row.status as RevisionStatus,
    reason: String(row.reason ?? ""),
    note: str(row.note),
    before: parseSnapshot(row.before) ?? EMPTY,
    after: parseSnapshot(row.after) ?? EMPTY,
    differencePence: num(row.difference_pence),
    holdQuoteId: str(row.hold_quote_id),
    sentAt: str(row.sent_at),
    respondedAt: str(row.responded_at),
    expiresAt: str(row.expires_at),
    createdAt: String(row.created_at),
  };
}

/** Every revision on a booking, newest first. */
export async function loadRevisionsForBooking(db: SupabaseClient, bookingId: string): Promise<RevisionView[]> {
  try {
    const { data, error } = await db
      .from("job_revisions")
      .select(REVISION_COLUMNS)
      .eq("booking_id", bookingId)
      .order("created_at", { ascending: false });
    if (error || !data) return [];
    return data.map((r) => toRevisionView(r as Row));
  } catch (err) {
    console.error("[revisions] load failed:", err);
    return [];
  }
}

export async function loadRevision(db: SupabaseClient, revisionId: string): Promise<RevisionView | null> {
  try {
    const { data } = await db.from("job_revisions").select(REVISION_COLUMNS).eq("id", revisionId).maybeSingle();
    return data ? toRevisionView(data as Row) : null;
  } catch (err) {
    console.error("[revisions] load failed:", err);
    return null;
  }
}

/**
 * The revisions that matter right now: the one waiting on the customer, the
 * one the customer approved (at most one per booking), and the latest one
 * the customer declined or let lapse — which is what unlocks "end the job".
 */
export function revisionMoney(revisions: readonly RevisionView[], now: Date = new Date()): {
  pending: RevisionView | null;
  approved: RevisionView | null;
  declined: RevisionView | null;
  holdQuoteIds: Set<string>;
} {
  const pending = revisions.find((r) => r.status === "sent" && !isRevisionExpired(r, now)) ?? null;
  const approved = revisions.find((r) => r.status === "approved") ?? null;
  const declined =
    revisions.find((r) => r.status === "declined" || r.status === "expired" || (r.status === "sent" && isRevisionExpired(r, now))) ??
    null;
  return {
    pending,
    approved,
    declined: pending ? null : declined,
    holdQuoteIds: new Set(revisions.map((r) => r.holdQuoteId).filter((v): v is string => Boolean(v))),
  };
}

/**
 * A revision as the customer's browser may see it: the before and after
 * totals and what the work is, never what a part, the oil or the labour
 * costs, nor the platform's cut. Zeroed rather than dropped so the shape is
 * unchanged. Diff it BEFORE redacting (`diffRevision` keys new parts on their
 * price). The web page only — the mobile API's shape is a contract.
 */
const safeLine = (l: RevisionLine): RevisionLine => (l.kind === "product" ? l : { ...l, linePence: 0 });
const safePart = (p: RevisionPart): RevisionPart => ({ ...p, unitPence: 0, linePence: 0 });

export function customerSafeRevision(revision: RevisionView): RevisionView {
  const snap = (s: RevisionSnapshot): RevisionSnapshot => ({
    ...s,
    lines: s.lines.map(safeLine),
    parts: s.parts.map(safePart),
    catalogueParts: undefined,
    oil: s.oil ? { ...s.oil, pencePerLitre: 0, pence: 0 } : null,
    hourlyRatePence: 0,
    commissionRate: 0,
    basePricePence: 0,
    partsPricePence: 0,
    platformFeePence: 0,
    mechanicPayoutPence: 0,
  });
  return { ...revision, before: snap(revision.before), after: snap(revision.after) };
}

/** The same redaction for a diff made from the unredacted revision. */
export function customerSafeDiff(diff: RevisionDiff): RevisionDiff {
  return {
    ...diff,
    lines: { added: diff.lines.added.map(safeLine), removed: diff.lines.removed.map(safeLine), kept: diff.lines.kept.map(safeLine) },
    parts: { added: diff.parts.added.map(safePart), removed: diff.parts.removed.map(safePart), kept: diff.parts.kept.map(safePart) },
  };
}
