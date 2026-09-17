import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { revisionPanelFor, sendRevision, type RevisionPartInput } from "@/lib/revisions/mechanic";

// /api/mobile/v1/mechanic/bookings/[id]/revision — "Change what's being done".
// AUTHENTICATED, mechanics only, and only the mechanic the job is assigned to.
// Both verbs run lib/revisions/mechanic.ts, as the website's panel does.
//
// GET — everything the app's panel draws, so it never rebuilds a snapshot.
// 200:  { current, revisions, canRevise, reviseBlocker, onSiteOptions? } — see
//       `RevisionPanelView`.
//       · current.repairs[].id   a catalogue id, as `repairIds` takes it. A
//                                combined repair is ONE entry, by its option id.
//       · current.parts          the mechanic's own parts only. Supplier parts
//                                priced into a repair belong to the repair and
//                                are re-priced with it.
//       · revisions              newest first; `summary` and `statusLabel`
//                                print as they are. A `sent` one past its
//                                expiry already reads "expired".
//       · reviseBlocker          the sentence POST would refuse with, or null
//       · onSiteOptions          ONLY when POST …/end-on-site would be allowed
//                                (the customer declined, or never answered).
//                                Labels and amounts are ours; absent otherwise.
//
// POST — price the revised job and send it to the customer, in one go.
// Body: { repairIds, parts, reason, note? }
//       repairIds  every repair the job should now have — kept and added alike
//       parts      RevisionPartInput[]: `{ id }` keeps a part from
//                  `current.parts`; `{ name, quantity, unitPence }` adds one.
//                  A part left out is removed.
//       reason     what the customer reads before approving. Required.
// 200:  { id } — the revision. The customer is emailed, texted and pushed.
// 400:  it can't be priced, nothing changed, or there's no reason.
// 409:  it can't be sent right now — the sentence is `reviseBlocker`'s.
// 403:  not this mechanic's job.   404: no such job.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.

interface RevisionBody {
  repairIds?: unknown;
  parts?: unknown;
  reason?: unknown;
  note?: unknown;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await mobileMechanicCaller(request, "mechanicfeed");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);

  try {
    const result = await revisionPanelFor(auth.caller.userId, id);
    if (!result.ok) return refusalResponse("mechanic/revision", result);
    return apiOk({
      current: result.current,
      revisions: result.revisions,
      canRevise: result.canRevise,
      reviseBlocker: result.reviseBlocker,
      ...(result.onSiteOptions ? { onSiteOptions: result.onSiteOptions } : {}),
    });
  } catch (err) {
    console.error("[mechanic/revision] failed", err);
    return apiError("We couldn't load this job's changes. Please try again in a moment.", 500);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = await readJsonBody<RevisionBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);

  const { repairIds, parts, reason, note } = parsed.body;
  const result = await sendRevision(auth.caller.userId, {
    bookingId: id,
    // The core checks both lists item by item and refuses what it can't price.
    repairIds: repairIds as string[],
    parts: parts as RevisionPartInput[],
    reason: typeof reason === "string" ? reason : "",
    note: typeof note === "string" ? note : null,
  });
  if (!result.ok) return refusalResponse("mechanic/revision", result);
  return apiOk({ id: result.id });
}
