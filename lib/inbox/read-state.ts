// Inbox read state (Task 52): the rules, shared by the website and mirrored by
// the app (src/lib/inbox.ts). Where it's stored is `customer_inbox_reads` (0075).
// Plain module: safe for client components.

export interface ReadState {
  /** Everything at or before this instant is read ("Mark all read"). */
  before: string | null;
  /** Items opened one at a time since, newest first. */
  ids: string[];
}

export const EMPTY_READ_STATE: ReadState = { before: null, ids: [] };

/** The table's cap on `read_ids`. */
export const MAX_READ_IDS = 200;

/**
 * Older than this counts as read without being opened. Otherwise a customer's
 * first visit would show their whole history as unread news.
 */
export const UNREAD_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function isUnread(item: { id: string; at: string }, state: ReadState, now: Date = new Date()): boolean {
  const at = new Date(item.at).getTime();
  if (!Number.isFinite(at) || now.getTime() - at > UNREAD_WINDOW_MS) return false;
  if (state.before && at <= new Date(state.before).getTime()) return false;
  return !state.ids.includes(item.id);
}

export function unreadCount(items: Array<{ id: string; at: string }>, state: ReadState, now: Date = new Date()): number {
  return items.reduce((count, item) => count + (isUnread(item, state, now) ? 1 : 0), 0);
}

/** A row from `customer_inbox_reads`, or nothing yet. */
export function readStateFromRow(row: { read_before: string | null; read_ids: string[] | null } | null): ReadState {
  if (!row) return EMPTY_READ_STATE;
  return {
    before: row.read_before,
    ids: Array.isArray(row.read_ids) ? row.read_ids.filter((id): id is string => typeof id === "string") : [],
  };
}
