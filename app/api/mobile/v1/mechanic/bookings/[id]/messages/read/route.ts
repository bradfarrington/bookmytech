import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { ownedBooking } from "@/lib/mechanics/owned-booking";
import { markMessagesReadFor } from "@/lib/messages/send";

// POST /api/mobile/v1/mechanic/bookings/[id]/messages/read — mark the
// customer's messages read, because the mechanic has the thread open.
// AUTHENTICATED, mechanics only. The mobile twin of the website's
// `markMessagesRead()` (lib/messages/send.ts). It also stops the unread-message
// sweep texting the mechanic about something they have already seen.
//
// No body.
// 200:  { cleared } — how many messages this marked. 0 is the usual answer.
// 403:  not this mechanic's job.   404: no such job.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.
//
// Counted against `mechanicfeed`, not `message`: an open thread calls this as
// it polls, and that must never use up the budget for actually replying.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await mobileMechanicCaller(request, "mechanicfeed");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);

  const owned = await ownedBooking(id, auth.caller.userId);
  if (!owned.ok) return refusalResponse("mechanic/messages/read", owned);

  const result = await markMessagesReadFor(id, { userId: auth.caller.userId, email: auth.caller.email });
  if (!result.ok) return apiError(result.error, 409);
  return apiOk({ cleared: result.cleared ?? 0 });
}
