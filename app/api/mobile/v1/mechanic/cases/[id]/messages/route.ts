import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { postResolutionMessageFor } from "@/lib/resolutions/core";

// POST /api/mobile/v1/mechanic/cases/[id]/messages — reply to Book My Tech in
// a Get-help case. AUTHENTICATED, mechanics only, and only in the caller's own
// case. The mobile twin of the website's `postResolutionMessage()`
// (`postResolutionMessageFor`, lib/resolutions/core.ts).
//
// Body: { body }
// 200:  { id } — the message. The thread is read from `resolution_messages`
//       under RLS.
// 400:  nothing typed.
// 403:  somebody else's case.   404: no such case.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.

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
  if (!isUuid(id)) return apiError("That case no longer exists.", 404);

  const result = await postResolutionMessageFor(
    id,
    typeof parsed.body.body === "string" ? parsed.body.body.slice(0, 2000) : "",
    { userId: auth.caller.userId, role: "mechanic" },
  );
  if (!result.ok) return refusalResponse("mechanic/cases/messages", result);
  return apiOk({ id: result.id });
}
