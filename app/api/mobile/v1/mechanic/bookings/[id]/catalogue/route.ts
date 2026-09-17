import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { searchJobCatalogue } from "@/lib/revisions/mechanic";

// GET /api/mobile/v1/mechanic/bookings/[id]/catalogue?query=… — anything
// bookable for THIS job's car: plain repairs, combined-repair options and
// products. For adding a repair to a revision; a hit's `id` goes into
// `repairIds`. AUTHENTICATED, mechanics only. The mobile twin of the website's
// `searchJobCatalogueAction()` (`searchJobCatalogue`, lib/revisions/mechanic.ts).
//
// Not the same search as …/repair-times, which returns only plain jobs with a
// book time, for a quote's labour lines.
//
// 200:  { hits: CatalogueHit[], truncated } — { id, description, billedHours,
//       pricePence, bundleName?, optionLabel?, fixedPrice }.
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
    const result = await searchJobCatalogue(auth.caller.userId, id, query);
    if (!result.ok) return refusalResponse("mechanic/catalogue", result);
    return apiOk({ hits: result.hits, truncated: result.truncated });
  } catch (err) {
    console.error("[mechanic/catalogue] failed", err);
    return apiError("We couldn't search repairs. Please try again in a moment.", 500);
  }
}
