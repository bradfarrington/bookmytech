import { mobileMechanicCaller } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { loadMechanicInbox } from "@/lib/inbox/mechanic-feed";

// GET /api/mobile/v1/mechanic/inbox — the mechanic's Inbox: one feed, newest
// first, at most 60 items. AUTHENTICATED, mechanics only.
//
// 200:  { unreadCount, items: MechanicInboxItem[] } — the item is documented in
//       lib/inbox/mechanic-events.ts. The `id` prefix names the source:
//         thread:<bookingId>   messages  an open conversation with a customer
//         dispute:<id>         alerts    a dispute on one of their jobs
//         event:<id>           alerts    something that happened to a job that
//                                        they did NOT do themselves
//         payout:<ledger id>   alerts    a payout, or a refund taken back
//         review:<id>          alerts    a new review
//         document:<id>        bmt       a document rejected, expired or
//                                        expiring within 30 days
//         case:<id>            bmt       a Get-help case
//       `link` says where a tap goes: { type: "thread" | "job", id: bookingId },
//       { type: "dispute" | "case", id }, or { type: "earnings" | "reviews" |
//       "documents" } with no id.
//       `unreadCount` counts every unread item, including any beyond the 60.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.
//
// UNREAD follows POST …/inbox/read and …/inbox/read-all, with two exceptions
// that are the feed's own: a `thread:` item is unread while it has unread
// messages, whatever was marked (POST …/bookings/<id>/messages/read clears it);
// and anything older than seven days counts as read without being opened.
//
// Assembled here rather than in the app because it draws on seven sources, two
// of which RLS hides at the moment they matter (a job reassigned away), and so
// the wording lives beside the customer's in lib/inbox/.

export async function GET(request: Request): Promise<Response> {
  const auth = await mobileMechanicCaller(request, "mechanicfeed");
  if (!auth.ok) return auth.response;

  try {
    return apiOk(await loadMechanicInbox(auth.caller.userId));
  } catch (err) {
    console.error("[mechanic/inbox] failed", err);
    return apiError("We couldn't load your inbox. Please try again in a moment.", 500);
  }
}
