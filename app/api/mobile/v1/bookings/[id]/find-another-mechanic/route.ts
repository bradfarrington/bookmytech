import { findAnotherMechanicFor } from "@/lib/bookings/manage-booking";
import { isUuid, mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";

// POST /api/mobile/v1/bookings/:id/find-another-mechanic — turn down the time
// the mechanic suggested and have the job offered to OTHER mechanics at a time
// the customer picks (0092). AUTHENTICATED.
//
// Only while a mechanic's proposal is waiting on the customer
// (reschedule_status 'proposed', reschedule_proposed_by not 'customer').
// Pre-fill the picker from the time the customer first asked for: the latest
// 'reschedule_proposed' booking event with payload.counter carries it as
// payload.requested { at, window }.
//
// Body: { scheduledAt, slotWindow? } — as POST …/reschedule.
// 200:  { ok: true } — the booking is back to sourcing_mechanic at that time,
//       with no mechanic, and dispatched afresh (the previous mechanic is not
//       offered it again).   { ok: false, error } — nothing to answer, a time
//       in the past. Non-2xx only for 401, 400/415, 429.

interface Body {
  scheduledAt?: unknown;
  slotWindow?: unknown;
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

  const scheduledAt = typeof parsed.body.scheduledAt === "string" ? parsed.body.scheduledAt.trim() : "";
  const slotWindow = typeof parsed.body.slotWindow === "string" ? parsed.body.slotWindow : null;
  return apiOk(await findAnotherMechanicFor(id, scheduledAt, auth.bookingCaller, slotWindow));
}
