import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { cancelOwnJobFor } from "@/lib/mechanics/cancel-job";
import { joinCancelReason } from "@/lib/mechanics/cancel-reasons";

// POST /api/mobile/v1/mechanic/bookings/[id]/cancel — hand a confirmed job
// back. AUTHENTICATED, mechanics only. The mobile twin of the website's
// `cancelOwnJob()` (lib/mechanics/cancel-job.ts): the job returns to
// `sourcing_mechanic`, is re-offered to other mechanics, and the customer is
// told a replacement is being found. Their card hold is left in place.
//
// Body: { reason, detail? } — `reason` is one of `cancelReasons` from
//       GET …/job; `detail` is free text. Stored as "reason: detail".
// 200:  {}
// 400:  no reason.
// 409:  the job is already under way, or otherwise can't be cancelled.
// 403:  not this mechanic's job.   404: no such job.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.

interface CancelBody {
  reason?: unknown;
  detail?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = await readJsonBody<CancelBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);

  const reason = typeof parsed.body.reason === "string" ? parsed.body.reason.trim() : "";
  const detail = typeof parsed.body.detail === "string" ? parsed.body.detail.slice(0, 500) : null;

  const result = await cancelOwnJobFor(auth.caller.userId, id, reason ? joinCancelReason(reason, detail) : "");
  if (!result.ok) return refusalResponse("mechanic/cancel", result);
  return apiOk({});
}
