import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { ownedBooking } from "@/lib/mechanics/owned-booking";
import { sendMessageFor } from "@/lib/messages/send";

// POST /api/mobile/v1/mechanic/bookings/[id]/messages — message the customer.
// AUTHENTICATED, mechanics only, and only on a job assigned to the caller. The
// mobile twin of the website's `sendMessage()`; both run lib/messages/send.ts,
// which stamps `sender_role`, pushes and texts the customer, and writes the
// `message_sent` event.
//
// Body: { body } — up to 2000 characters.
// 200:  { id } — the new message.
// 409:  { error } — it wasn't sent, and the sentence says why: nothing typed,
//       too long, or "This booking has finished, so its messages are closed."
// 403:  not this mechanic's job.   404: no such job.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.
//
// Unlike the customer's route, a refusal here is a non-2xx `{ error }`, like
// every other mechanic route.
//
// READS go direct to Supabase under the mechanic's messages policy. `messages`
// is not in the realtime publication, so the app polls, as the website does.

interface MessageBody {
  body?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = await readJsonBody<MessageBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request, "message");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);

  // The core accepts either party to the booking. This route is for the
  // mechanic, so a mechanic who is also that booking's CUSTOMER doesn't post
  // as one from here.
  const owned = await ownedBooking(id, auth.caller.userId);
  if (!owned.ok) return refusalResponse("mechanic/messages", owned);

  const body = typeof parsed.body.body === "string" ? parsed.body.body : "";
  const result = await sendMessageFor(id, body, { userId: auth.caller.userId, email: auth.caller.email });
  if (!result.ok) return apiError(result.error, 409);
  return apiOk({ id: result.id });
}
