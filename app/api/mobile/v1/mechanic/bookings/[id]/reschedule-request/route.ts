import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { acceptCustomerRescheduleFor } from "@/lib/bookings/customer-reschedule";

// POST /api/mobile/v1/mechanic/bookings/[id]/reschedule-request — accept a new
// time the customer asked for (0092). AUTHENTICATED, mechanics only. Twin of
// the website's `acceptCustomerReschedule()`.
//
// Body: { decision: "accept" } — the job moves to the time (and arrival
//       window) asked for. There is no decline: to say no, POST …/reschedule
//       with another time, as for any proposal. It replaces the request and
//       the customer answers it.
//
// The request shows on the booking as reschedule_status 'proposed' with
// reschedule_proposed_by 'customer', reschedule_proposed_at and
// reschedule_proposed_window (2-hour label or null), reschedule_note.
//
// 200:  {}
// 400:  decision isn't "accept".   409: nothing waiting, the job has moved
//       on, or the time has passed.   403: not this mechanic's job.
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

  if (parsed.body.decision !== "accept")
    return apiError("To say no, suggest another time instead.", 400);

  const result = await acceptCustomerRescheduleFor(auth.caller.userId, id);
  if (!result.ok) return refusalResponse("mechanic/reschedule-request", result);
  revalidatePath("/mechanic/jobs");
  revalidatePath(`/mechanic/jobs/${id}`);
  return apiOk({});
}
