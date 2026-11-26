import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { jobManualsFor } from "@/lib/mechanics/technical-data";

// GET /api/mobile/v1/mechanic/bookings/[id]/technical/manuals — the
// manufacturer's repair manuals for THIS job's vehicle (Task 86). AUTHENTICATED,
// mechanics only, and only the mechanic the booking is assigned to. The mobile
// twin of /mechanic/jobs/[id]/technical?tab=manuals (Task 27).
//
// 200:  { matched, vehicle, manuals: [{ storyId, name }] }
//       · matched  false when the reg doesn't resolve to a HaynesPro car type
//                  (or HaynesPro isn't configured): `manuals` is then [] and
//                  the app says so, rather than this being an error
//       · vehicle  HaynesPro's description of the car, or null
// 403:  not this mechanic's job.   404: no such job.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await mobileMechanicCaller(request, "mechanicfeed");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);

  try {
    const result = await jobManualsFor(auth.caller.userId, id);
    if (!result.ok) return refusalResponse("mechanic/technical/manuals", result);
    return apiOk({ matched: result.matched, vehicle: result.vehicle, manuals: result.manuals });
  } catch (err) {
    console.error("[mechanic/technical/manuals] failed", err);
    return apiError("We couldn't load the repair manuals. Please try again in a moment.", 500);
  }
}
