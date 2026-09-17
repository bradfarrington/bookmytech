import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { followOnDraftFor } from "@/lib/revisions/mechanic";

// GET /api/mobile/v1/mechanic/bookings/[id]/follow-on-draft — the work an
// approved revision took off this job, as quote lines for a return visit
// ("Quote the rest of the work"). AUTHENTICATED, mechanics only.
//
// On the website the job PAGE works this out and hands it to its panel, so
// there was nothing for the app to read; this serves the same
// `followOnLinesFromRevision`. Nothing is saved — the app opens its quote
// builder on these lines and sends them, edited or not, through
// POST …/quotes with `kind: "follow_on"`.
//
// 200:  { title, note, lines: QuoteLineInput[] } — labour lines carry the
//       repair's `nodeId` and book `hours`; part lines a `quantity` and
//       `unitPence`. `lines` is EMPTY when there is nothing to offer: the job
//       isn't completed yet, or no revision was approved on it.
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

  const result = await followOnDraftFor(auth.caller.userId, id);
  if (!result.ok) return refusalResponse("mechanic/follow-on-draft", result);
  return apiOk({ title: result.title, note: result.note, lines: result.lines });
}
