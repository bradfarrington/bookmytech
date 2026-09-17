import { mobileMechanicCaller } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { loadMechanicInbox, markMechanicInboxItemRead } from "@/lib/inbox/mechanic-feed";
import { READABLE_ITEM_ID } from "@/lib/inbox/mechanic-events";

// POST /api/mobile/v1/mechanic/inbox/read — one item opened. AUTHENTICATED,
// mechanics only.
//
// Body: { id } — an item's `id` from GET …/inbox, e.g. "event:<uuid>".
// 200:  { unreadCount } — the count afterwards, for the tab badge.
// 400:  not an inbox item id.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.
//
// A `thread:<bookingId>` id is accepted and changes nothing: a conversation is
// unread while it has unread messages, and POST …/bookings/<id>/messages/read
// is what clears those.
//
// Stored in `mechanic_inbox_reads` (0085), so it follows the mechanic from
// phone to phone. Before that migration this answers 200 and remembers nothing.

interface ReadBody {
  id?: unknown;
}

const THREAD_ID = /^thread:[0-9a-f-]{36}$/i;

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<ReadBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request, "mechanicfeed");
  if (!auth.ok) return auth.response;

  const { id } = parsed.body;
  if (typeof id !== "string" || !(READABLE_ITEM_ID.test(id) || THREAD_ID.test(id))) {
    return apiError("Something went wrong. Please update the app and try again.", 400);
  }

  try {
    await markMechanicInboxItemRead(auth.caller.supabase, id);
    const { unreadCount } = await loadMechanicInbox(auth.caller.userId);
    return apiOk({ unreadCount });
  } catch (err) {
    console.error("[mechanic/inbox/read] failed", err);
    return apiError("We couldn't update your inbox. Please try again in a moment.", 500);
  }
}
