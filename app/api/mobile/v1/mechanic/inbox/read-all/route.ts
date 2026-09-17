import { mobileMechanicCaller } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { loadMechanicInbox, markMechanicInboxAllRead } from "@/lib/inbox/mechanic-feed";

// POST /api/mobile/v1/mechanic/inbox/read-all — "Mark all read". AUTHENTICATED,
// mechanics only.
//
// No body.
// 200:  { unreadCount } — usually 0. NOT always: a conversation with unread
//       messages stays unread until the thread itself is read, so the badge
//       can't be cleared past a customer who is still waiting on a reply.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.

export async function POST(request: Request): Promise<Response> {
  const auth = await mobileMechanicCaller(request, "mechanicfeed");
  if (!auth.ok) return auth.response;

  try {
    await markMechanicInboxAllRead(auth.caller.supabase);
    const { unreadCount } = await loadMechanicInbox(auth.caller.userId);
    return apiOk({ unreadCount });
  } catch (err) {
    console.error("[mechanic/inbox/read-all] failed", err);
    return apiError("We couldn't update your inbox. Please try again in a moment.", 500);
  }
}
