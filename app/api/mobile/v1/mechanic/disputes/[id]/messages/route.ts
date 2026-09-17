import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { sendDisputeMessageFor } from "@/lib/disputes/core";
import { mechanicDisputeViewFor } from "@/lib/disputes/mechanic-view";

// POST /api/mobile/v1/mechanic/disputes/[id]/messages — reply in a dispute's
// thread, with evidence if there is any. AUTHENTICATED, mechanics only. The
// mobile twin of the website's `sendDisputeMessage()`; both run
// `sendDisputeMessageFor` (lib/disputes/core.ts). A mechanic's first reply to a
// customer's dispute moves it from `opened` to `responded`, as it always has.
//
// Body: { body, photos? } — `photos` is up to 6 URLs from
//       POST …/mechanic/disputes/photos; anything that isn't the caller's own
//       upload is dropped. With photos, `body` may be empty.
// 200:  { id } — the message.
// 400:  nothing to send.
// 409:  the dispute is closed.
// 403:  not a party to it.   404: no such dispute.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.
//
// The mechanic's own words and photos, and nothing else: a body cannot carry an
// offer, an acceptance or a decision, because there is no such field to carry
// it in. `visibleTo` (Book My Tech's private notes) is not read from this body,
// and the core would ignore it from a mechanic if it were.

interface MessageBody {
  body?: unknown;
  photos?: unknown;
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
  if (!isUuid(id)) return apiError("That dispute no longer exists.", 404);

  // As the MECHANIC on the job — not as its customer, and not as an admin who
  // happens to hold the mechanic app.
  const mine = await mechanicDisputeViewFor(auth.caller.userId, id);
  if (!mine.ok) return refusalResponse("mechanic/disputes/messages", mine);

  const result = await sendDisputeMessageFor(
    id,
    typeof parsed.body.body === "string" ? parsed.body.body : "",
    { userId: auth.caller.userId, email: auth.caller.email },
    { photos: parsed.body.photos },
  );
  if (!result.ok) return refusalResponse("mechanic/disputes/messages", result);
  return apiOk({ id: result.id });
}
