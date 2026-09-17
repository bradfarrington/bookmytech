import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { searchJobRepairTimes } from "@/lib/quotes/mechanic";

// GET /api/mobile/v1/mechanic/bookings/[id]/repair-times?query=… — book times
// for THIS job's vehicle, for the quote builder: picking a hit fills a labour
// line's description, hours and `nodeId`. AUTHENTICATED, mechanics only. The
// mobile twin of the website's `searchJobRepairTimesAction()`
// (`searchJobRepairTimes`, lib/quotes/mechanic.ts).
//
// 200:  { hits: [{ nodeId, description, hours, pricePence }], truncated }
//       A query under 3 characters is `{ hits: [], truncated: false }`.
// 409:  the catalogue couldn't be searched for this vehicle; the sentence says so.
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

  const query = (new URL(request.url).searchParams.get("query") ?? "").slice(0, 120);
  try {
    const result = await searchJobRepairTimes(auth.caller.userId, id, query);
    if (!result.ok) return refusalResponse("mechanic/repair-times", result);
    return apiOk({ hits: result.hits, truncated: result.truncated });
  } catch (err) {
    console.error("[mechanic/repair-times] failed", err);
    return apiError("We couldn't search repair times. Please try again in a moment.", 500);
  }
}
