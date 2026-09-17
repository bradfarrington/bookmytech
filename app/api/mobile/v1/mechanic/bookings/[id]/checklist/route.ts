import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { saveChecklistResultFor } from "@/lib/checklists/save-result";
import { progressView } from "@/lib/mechanics/job-view";

// POST /api/mobile/v1/mechanic/bookings/[id]/checklist — answer one checklist
// item, or comment on it. AUTHENTICATED, mechanics only. The mobile twin of the
// website's `saveChecklistResult()` (lib/checklists/save-result.ts). One
// request per tap: each answer is saved on its own.
//
// Body: { itemId, result?, comment? }
//       `result` is one of the checklist's `answers` from GET …/job. Leave a
//       field OUT to keep its current value; send `comment: ""` to clear one.
//       A first save needs a `result` — a comment can't stand alone.
// 200:  { progress: { answered, total, advisories, fails }, completeBlocker }
//       `progress` is for the checklist the item belongs to, counted with this
//       answer in; `completeBlocker` is as GET …/job. The app's counters come
//       from here so they can't drift from what completion will check.
// 400:  not one of the answers, or no answer yet.
// 404:  no such job, or the item isn't on this job's checklist.
// 409:  the job isn't in progress — begin work first.
// 403:  not this mechanic's job.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.
//
// Its own rate-limit family: a checklist is 46–173 items tapped one after
// another, which the `mechanic` family's 15 a minute would refuse.

interface ChecklistBody {
  itemId?: unknown;
  result?: unknown;
  comment?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = await readJsonBody<ChecklistBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request, "mechanicchecklist");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);

  const { itemId, result: answer, comment } = parsed.body;
  if (typeof itemId !== "string" || !isUuid(itemId)) {
    return apiError("That item isn't on this job's checklist.", 404);
  }

  const result = await saveChecklistResultFor(
    auth.caller.userId,
    {
      bookingId: id,
      itemId,
      // Absent (or the wrong type) = keep what's there.
      result: typeof answer === "string" ? answer : undefined,
      comment: typeof comment === "string" ? comment : undefined,
    },
    { withBlocker: true },
  );
  if (!result.ok) return refusalResponse("mechanic/checklist", result);
  return apiOk({ progress: progressView(result.progress), completeBlocker: result.completeBlocker });
}
