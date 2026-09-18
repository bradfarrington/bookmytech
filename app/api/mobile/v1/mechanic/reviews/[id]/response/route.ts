import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { respondToReviewFor } from "@/lib/reviews/respond";

// POST /api/mobile/v1/mechanic/reviews/[id]/response — reply publicly to one of
// your reviews. AUTHENTICATED, mechanics only, and only on your own review.
//
// Body: { response } — 1 to 1000 characters.
// 200:  {}
// 400:  empty or too long.   403: "This isn't your review."   404: no such review.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.
//
// EDITING a reply is this same call: there is one reply per review and it is
// overwritten in place, exactly as the website's editor has always behaved.
//
// The reviews themselves are a direct RLS read the app already does, with the
// `bookings(customer_name)` join. Only this write needs the server: mechanics
// have no UPDATE rights on `reviews`.
//
// Twin of `respondToReview` (app/actions/reviews.ts); both run
// lib/reviews/respond.ts.

interface ResponseBody {
  response?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = await readJsonBody<ResponseBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request, "mechanic");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That review no longer exists.", 404);

  const response = parsed.body.response;
  if (typeof response !== "string") return apiError("Write a reply first.", 400);

  const result = await respondToReviewFor(auth.caller.userId, id, response);
  if (!result.ok) return refusalResponse("mechanic/reviews/response", result);
  return apiOk({});
}
