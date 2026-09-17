import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { withdrawDisputeFor } from "@/lib/disputes/core";
import { mechanicDisputeViewFor } from "@/lib/disputes/mechanic-view";

// POST /api/mobile/v1/mechanic/disputes/[id]/withdraw — take back an issue the
// mechanic raised THEMSELVES. AUTHENTICATED, mechanics only. The mobile twin of
// the website's `withdrawDispute()`; both run `withdrawDisputeFor`
// (lib/disputes/core.ts). No money moves, and the job goes back to the status
// it had when the issue was raised.
//
// A mechanic can never withdraw a CUSTOMER's dispute — that would be deciding
// it, and only Book My Tech decides one. The core refuses anyone but the
// opener, and `can.withdraw` on GET …/disputes/<id> is false for them.
//
// No body.
// 200:  {}
// 409:  already closed.
// 403:  somebody else raised it, or not a party to it.   404: no such dispute.
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
  if (!mine.ok) return refusalResponse("mechanic/disputes/withdraw", mine);

  const result = await withdrawDisputeFor(id, { userId: auth.caller.userId, email: auth.caller.email });
  if (!result.ok) return refusalResponse("mechanic/disputes/withdraw", result);
  return apiOk({});
}
