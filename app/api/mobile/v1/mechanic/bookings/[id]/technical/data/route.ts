import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { jobTechnicalDataFor } from "@/lib/mechanics/technical-data";

// GET /api/mobile/v1/mechanic/bookings/[id]/technical/data — adjustments and
// specifications, capacities and VIN/ID-plate locations for THIS job's vehicle
// (Task 86). AUTHENTICATED, mechanics only, and only the mechanic the booking
// is assigned to. The mobile twin of /mechanic/jobs/[id]/technical?tab=data.
//
// 200:  { matched, vehicle, adjustments, capacities, idLocations }
//       · matched      as …/technical/manuals: false → every list is []
//       · adjustments  [{ name, value, unit, remark, rows }] — one group per
//                      entry, `rows` nested to any depth; a row with rows is a
//                      heading over them
//       · capacities   the same row shape, flat at the top
//       · idLocations  one list of lines per location, each line
//                      { name, text, remark, imageUrl, lines }
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
    const result = await jobTechnicalDataFor(auth.caller.userId, id);
    if (!result.ok) return refusalResponse("mechanic/technical/data", result);
    return apiOk({
      matched: result.matched,
      vehicle: result.vehicle,
      adjustments: result.adjustments,
      capacities: result.capacities,
      idLocations: result.idLocations,
    });
  } catch (err) {
    console.error("[mechanic/technical/data] failed", err);
    return apiError("We couldn't load the technical data. Please try again in a moment.", 500);
  }
}
