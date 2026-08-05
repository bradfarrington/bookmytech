import { rescheduleBookingFor } from "@/lib/bookings/manage-booking";
import { isUuid, mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";

// POST /api/mobile/v1/bookings/:id/reschedule — move a booking. AUTHENTICATED.
//
// Body: { scheduledAt, reason }
// 200:  { ok: true } | { ok: false, error }. A booking that's past the point of
//       moving, or a slot in the past, is a request that RAN with a negative
//       answer. Only transport-level problems return `{ error }` with a
//       non-2xx: 401, 400/415 (bad body or id), 429.
//
// Thin wrapper over `rescheduleBookingFor` — the SAME function the website's
// dashboard calls through app/actions/customer-bookings.ts.
//
// This APPLIES the new time rather than proposing it: the customer sets the
// slot, the mechanic is emailed, and they can re-propose or cancel from their
// own tools if it doesn't work. It also supersedes any pending mechanic
// proposal, so an app that shows both a "reschedule" button and a "respond to
// proposal" banner will find this clears the banner.
//
// `scheduledAt` clears the booking's arrival window (`slot_window`), because a
// specific chosen time and an "8am–10am" window can't both be true. The app
// should expect `slot_window` to be null afterwards and render the exact time.
//
// OWNERSHIP comes from the verified caller, never the path.

interface RescheduleBody {
  scheduledAt?: unknown;
  reason?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return apiError("We couldn't find that booking.", 400);

  const parsed = await readJsonBody<RescheduleBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileActionCaller(request, "action");
  if (!auth.ok) return auth.response;

  const scheduledAt =
    typeof parsed.body.scheduledAt === "string" ? parsed.body.scheduledAt.trim() : "";
  const reason = typeof parsed.body.reason === "string" ? parsed.body.reason : "";

  return apiOk(await rescheduleBookingFor(id, scheduledAt, reason, auth.bookingCaller));
}
