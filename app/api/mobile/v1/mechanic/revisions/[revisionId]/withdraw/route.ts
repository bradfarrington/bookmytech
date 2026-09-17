import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { withdrawRevision } from "@/lib/revisions/mechanic";

// POST /api/mobile/v1/mechanic/revisions/[revisionId]/withdraw — take back a
// revised job the customer hasn't answered. AUTHENTICATED, mechanics only. The
// mobile twin of the website's `withdrawRevisionAction()` (`withdrawRevision`,
// lib/revisions/mechanic.ts). A card hold the customer had started for the
// difference is released. A revision waiting on the customer blocks
// completion, so this is also how a mechanic unblocks "Complete".
//
// No body.
// 200:  {}
// 409:  it isn't waiting on the customer any more.
// 403:  not this mechanic's.   404: no such revision.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ revisionId: string }> },
): Promise<Response> {
  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { revisionId } = await params;
  if (!isUuid(revisionId)) return apiError("That revised job no longer exists.", 404);

  const result = await withdrawRevision(auth.caller.userId, revisionId);
  if (!result.ok) return refusalResponse("mechanic/revisions/withdraw", result);
  return apiOk({});
}
