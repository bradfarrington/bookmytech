import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { escalateDisputeFor } from "@/lib/disputes/core";
import { mechanicDisputeViewFor } from "@/lib/disputes/mechanic-view";

// POST /api/mobile/v1/mechanic/disputes/[id]/escalate — "Ask Book My Tech to
// step in": hand the decision to Book My Tech now, rather than waiting for the
// 48 hours to run out. AUTHENTICATED, mechanics only. The mobile twin of the
// website's `escalateDispute()`; both run `escalateDisputeFor`
// (lib/disputes/core.ts).
//
// It hands the decision OVER. It does not make one: no money moves, nothing is
// resolved, and the outcome is still entirely Book My Tech's.
//
// No body.
// 200:  {}
// 409:  it is already with Book My Tech, or closed.
// 403:  not a party to it.   404: no such dispute.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That dispute no longer exists.", 404);

  // As the MECHANIC on the job — see …/messages/route.ts.
  const mine = await mechanicDisputeViewFor(auth.caller.userId, id);
  if (!mine.ok) return refusalResponse("mechanic/disputes/escalate", mine);

  const result = await escalateDisputeFor(id, { userId: auth.caller.userId, email: auth.caller.email });
  if (!result.ok) return refusalResponse("mechanic/disputes/escalate", result);
  return apiOk({});
}
