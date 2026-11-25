import { askBookMyTechToCancelFor } from "@/lib/bookings/manage-booking";
import { isUuid, mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";

// POST /api/mobile/v1/bookings/:id/cancellation-request — turn down the time
// the mechanic suggested and ask Book My Tech to cancel (0092). AUTHENTICATED.
//
// Only while a mechanic's proposal is waiting on the customer. The proposal
// is declined (the booking keeps its time) and the admin team is asked; an
// admin cancels it — charging the fee the booking's time allows, or waiving
// it — or dismisses the request.
//
// Body: { reason } — required.
// 200:  { ok: true } | { ok: false, error } — no reason, nothing to answer,
//       already asked. Non-2xx only for 401, 400/415, 429.

interface Body {
  reason?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return apiError("We couldn't find that booking.", 400);

  const parsed = await readJsonBody<Body>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileActionCaller(request, "action");
  if (!auth.ok) return auth.response;

  const reason = typeof parsed.body.reason === "string" ? parsed.body.reason : "";
  return apiOk(await askBookMyTechToCancelFor(id, reason, auth.bookingCaller));
}
