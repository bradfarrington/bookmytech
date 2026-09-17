import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { jobViewFor } from "@/lib/mechanics/job-view";

// GET /api/mobile/v1/mechanic/bookings/[id]/job — what the job screen can't
// assemble from its own RLS reads. AUTHENTICATED, mechanics only, and only the
// mechanic the booking is assigned to.
//
// 200:  { destination, distanceMiles, money, checklists, completeBlocker,
//         cancelReasons } — see `JobView` in lib/mechanics/job-view.ts.
//       · destination      { lat, lng } of the job's postcode, or null
//       · money            the same sum as the website's job page
//       · checklists       [] when the job has none; items carry their answers
//       · completeBlocker  the sentence POST …/complete would refuse with right
//                          now (unfinished checklist, no mileage, a quote or
//                          revision awaiting the customer), or null. It does
//                          not look at the job's status.
//       · cancelReasons    the values POST …/cancel expects as `reason`
// 403:  not this mechanic's job.   404: no such job.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.
//
// The booking row itself, its repairs, events, photos, parts, quotes and
// messages are read by the app directly.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await mobileMechanicCaller(request, "mechanicfeed");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);

  try {
    const result = await jobViewFor(auth.caller.userId, id);
    if (!result.ok) return refusalResponse("mechanic/job", result);
    return apiOk({
      destination: result.destination,
      distanceMiles: result.distanceMiles,
      money: result.money,
      checklists: result.checklists,
      completeBlocker: result.completeBlocker,
      cancelReasons: result.cancelReasons,
    });
  } catch (err) {
    console.error("[mechanic/job] failed", err);
    return apiError("We couldn't load this job. Please try again in a moment.", 500);
  }
}
