import { withdrawRescheduleRequestFor } from "@/lib/bookings/manage-booking";
import { isUuid, mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";

// POST /api/mobile/v1/bookings/:id/reschedule-request/withdraw — take back a
// new time the customer asked for that the mechanic hasn't answered (0092).
// AUTHENTICATED.
//
// Body: none.
// 200:  { ok: true } | { ok: false, error } — "nothing to withdraw" (already
//       answered, or never asked) is a request that RAN with a negative
//       answer. Non-2xx only for 401, 400 (bad id), 429.
//
// The booking never moved, so this only clears the request; the mechanic gets
// a push.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return apiError("We couldn't find that booking.", 400);

  const auth = await mobileActionCaller(request, "action");
  if (!auth.ok) return auth.response;

  return apiOk(await withdrawRescheduleRequestFor(id, auth.bookingCaller));
}
