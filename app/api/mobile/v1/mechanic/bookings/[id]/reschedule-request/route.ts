import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { respondToCustomerRescheduleFor } from "@/lib/bookings/customer-reschedule";

// POST /api/mobile/v1/mechanic/bookings/[id]/reschedule-request — answer a new
// time the customer asked for (0092). AUTHENTICATED, mechanics only. Twin of
// the website's `respondToCustomerReschedule()`.
//
// Body: { decision: "accept" | "decline" }
//   accept  — the job moves to the time (and arrival window) asked for.
//   decline — it stays where it is; the customer is told.
// To suggest another time instead, POST …/reschedule as for any proposal: it
// replaces the request and the customer answers it.
//
// The request shows on the booking as reschedule_status 'proposed' with
// reschedule_proposed_by 'customer', reschedule_proposed_at and
// reschedule_proposed_window (2-hour label or null), reschedule_note.
//
// 200:  {}
// 400:  not accept/decline.   409: nothing waiting, the job has moved on, or
//       (accept) the time has passed.   403: not this mechanic's job.
//       404: no such job.   Otherwise `{ error }`: 401, 429, 500.

interface Body {
  decision?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = await readJsonBody<Body>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);

  const decision = parsed.body.decision;
  if (decision !== "accept" && decision !== "decline")
    return apiError("Choose accept or decline.", 400);

  const result = await respondToCustomerRescheduleFor(auth.caller.userId, id, decision);
  if (!result.ok) return refusalResponse("mechanic/reschedule-request", result);
  revalidatePath("/mechanic/jobs");
  revalidatePath(`/mechanic/jobs/${id}`);
  return apiOk({});
}
