import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { declineOfferFor } from "@/lib/mechanics/offers";

// POST /api/mobile/v1/mechanic/offers/[id]/decline — pass on the job.
// AUTHENTICATED, mechanics only. The mobile twin of the website's
// `declineOffer()`; both run lib/mechanics/offers.ts.
//
// No body.
// 200:  {} — it leaves THIS mechanic's feed only; every other mechanic still
//       holds their offer.
// 409:  already answered (or superseded).   403: not yours.   404: no such offer.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That offer no longer exists.", 404);

  const result = await declineOfferFor(auth.caller.userId, id);
  if (!result.ok) return refusalResponse("mechanic/offers/decline", result);

  return apiOk({});
}
