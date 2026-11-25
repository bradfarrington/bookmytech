import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { requestAdminCancellationFor } from "@/lib/bookings/cancellation-request";

// POST /api/mobile/v1/mechanic/bookings/[id]/cancellation-request — ask Book
// My Tech to cancel this job. AUTHENTICATED, mechanics only. Twin of the
// website's `requestCancellationFromAdmin()`.
//
// Body: { reason } — required, why they want it cancelled.
// 200:  {} — the admin team is emailed; an admin cancels it (charging the
//       fee the booking's time allows, or waiving it) or dismisses the ask.
// 400:  no reason.   409: already asked, or the job is past cancelling.
// 403:  not this mechanic's job.   404: no such job.
//       Otherwise `{ error }`: 401, 429, 500.
//
// Whether a request is open is not on the booking row: it is a
// booking_events 'note' (lib/bookings/cancellation-request.ts). The app knows
// it asked from this 200; a 409 "already asked" on a second try says the same.

interface Body {
  reason?: unknown;
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

  const reason = typeof parsed.body.reason === "string" ? parsed.body.reason : "";
  const result = await requestAdminCancellationFor(auth.caller.userId, id, reason);
  if (!result.ok) return refusalResponse("mechanic/cancellation-request", result);
  return apiOk({});
}
