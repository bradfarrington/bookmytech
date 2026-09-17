import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { startJourneyFor } from "@/lib/mechanics/job-progress";

// POST /api/mobile/v1/mechanic/bookings/[id]/start-journey — confirmed →
// en_route. AUTHENTICATED, mechanics only. The mobile twin of the website's
// `startJourney()`; both run lib/mechanics/job-progress.ts, so the
// `status_changed` event and the customer's "on the way" email, SMS and push
// are identical.
//
// No body.
// 200:  { status: "en_route" }
// 409:  the job isn't `confirmed` any more (already started, cancelled, moved).
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

  const result = await startJourneyFor(auth.caller.userId, id);
  if (!result.ok) return refusalResponse("mechanic/start-journey", result);
  return apiOk({ status: "en_route" });
}
