import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { beginWorkFor } from "@/lib/mechanics/job-progress";

// POST /api/mobile/v1/mechanic/bookings/[id]/begin-work — en_route →
// in_progress; stamps `started_at`. AUTHENTICATED, mechanics only. The mobile
// twin of the website's `beginWork()` (lib/mechanics/job-progress.ts).
//
// No body.
// 200:  { status: "in_progress" }
// 409:  the job isn't `en_route`.
// 403:  not this mechanic's job.   404: no such job.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);

  const result = await beginWorkFor(auth.caller.userId, id);
  if (!result.ok) return refusalResponse("mechanic/begin-work", result);
  return apiOk({ status: "in_progress" });
}
