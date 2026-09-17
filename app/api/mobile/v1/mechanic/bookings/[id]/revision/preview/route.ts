import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { previewRevision, previewView, type RevisionPartInput } from "@/lib/revisions/mechanic";

// POST /api/mobile/v1/mechanic/bookings/[id]/revision/preview — what a revised
// job WOULD come to. Nothing is saved and nobody is told. AUTHENTICATED,
// mechanics only. The mobile twin of the website's `previewRevisionAction()`
// (`previewRevision`, lib/revisions/mechanic.ts) — priced exactly as the
// checkout prices a basket for this car, at the booking's own rate and
// commission, and the same figures the customer will be shown.
//
// Body: { repairIds, parts } — as POST …/revision.
// 200:  { before, after, diff } — `RevisionPreviewView`: the two totals,
//       take-homes and visit lengths, and what was added, removed and kept.
//       `diff.direction` is "more" | "less" | "same", from `differencePence`.
// 400:  { error } — the draft can't be priced yet, and the sentence says why
//       (no repairs left, a part with no name or price, a repair this car
//       can't be priced for). Expected while editing, not a failure.
// 409:  the job isn't in progress.
// 403:  not this mechanic's job.   404: no such job.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.
//
// `mechanicfeed`, because it is called as the mechanic edits.

interface PreviewBody {
  repairIds?: unknown;
  parts?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = await readJsonBody<PreviewBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request, "mechanicfeed");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);

  try {
    const result = await previewRevision(auth.caller.userId, {
      bookingId: id,
      repairIds: parsed.body.repairIds as string[],
      parts: parsed.body.parts as RevisionPartInput[],
    });
    if (!result.ok) return refusalResponse("mechanic/revision/preview", result);
    return apiOk(previewView(result.preview));
  } catch (err) {
    console.error("[mechanic/revision/preview] failed", err);
    return apiError("We couldn't price that just now. Please try again in a moment.", 500);
  }
}
