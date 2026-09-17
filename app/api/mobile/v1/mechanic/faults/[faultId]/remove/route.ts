import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { deleteFault } from "@/lib/quotes/mechanic";

// POST /api/mobile/v1/mechanic/faults/[faultId]/remove — take back a fault
// note. AUTHENTICATED, mechanics only. The mobile twin of the website's
// `deleteFaultAction()` (`deleteFault`, lib/quotes/mechanic.ts).
//
// No body.
// 200:  {}
// 409:  the fault has a quote against it — withdraw the quote first.
// 403:  somebody else's fault note.   404: no such fault.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ faultId: string }> },
): Promise<Response> {
  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { faultId } = await params;
  if (!isUuid(faultId)) return apiError("That fault no longer exists.", 404);

  const result = await deleteFault(auth.caller.userId, faultId);
  if (!result.ok) return refusalResponse("mechanic/faults/remove", result);
  return apiOk({});
}
