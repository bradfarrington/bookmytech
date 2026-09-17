import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { updateResolutionStatusFor } from "@/lib/resolutions/core";

// POST /api/mobile/v1/mechanic/cases/[id]/close — "this is sorted": close the
// caller's own Get-help case. AUTHENTICATED, mechanics only. The mobile twin of
// the website's `updateResolutionStatus(id, "closed")`
// (`updateResolutionStatusFor`, lib/resolutions/core.ts).
//
// Closing is the ONLY status a mechanic can set; open, in progress and resolved
// are Book My Tech's. The status is fixed here, not read from a body.
//
// No body.
// 200:  {}
// 403:  somebody else's case.   404: no such case.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That case no longer exists.", 404);

  const result = await updateResolutionStatusFor(id, "closed", undefined, {
    userId: auth.caller.userId,
    role: "mechanic",
  });
  if (!result.ok) return refusalResponse("mechanic/cases/close", result);
  return apiOk({});
}
