import { sendMessageFor } from "@/lib/messages/send";
import { isUuid, mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";

// POST /api/mobile/v1/bookings/:id/messages — message your mechanic.
// AUTHENTICATED.
//
// Body: { body }  — up to 2000 characters.
// 200:  { ok: true } | { ok: false, error }. "You're not part of this booking",
//       "This booking has finished, so its messages are closed" and "Type a
//       message first" are requests that RAN with a negative answer. Only
//       transport-level problems return `{ error }` with a non-2xx: 401,
//       400/415 (bad body or id), 429.
//
// Thin wrapper over `sendMessageFor` — the SAME function the website's thread
// calls through app/actions/messages.ts. It stamps `sender_role` from the
// caller's relationship to the booking (never sent), and on a mechanic's
// message pushes + texts the customer. From a customer the mechanic is nudged
// by the unread-message sweep.
//
// OWNERSHIP: the core refuses anyone who isn't the booking's customer or its
// assigned mechanic, so knowing a booking id gets you nothing.
//
// READS go direct to Supabase under "Customers read own booking messages"
// (0019) — no endpoint needed. `messages` is NOT in the realtime publication
// (0049 explains why), so the app polls, as the website does.

interface MessageBody {
  body?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return apiError("We couldn't find that booking.", 400);

  const parsed = await readJsonBody<MessageBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileActionCaller(request, "message");
  if (!auth.ok) return auth.response;

  const body = typeof parsed.body.body === "string" ? parsed.body.body : "";

  return apiOk(await sendMessageFor(id, body, auth.bookingCaller));
}
