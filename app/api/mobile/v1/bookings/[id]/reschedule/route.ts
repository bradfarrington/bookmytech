import { rescheduleBookingFor } from "@/lib/bookings/manage-booking";
import { isUuid, mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";

// POST /api/mobile/v1/bookings/:id/reschedule — move a booking. AUTHENTICATED.
//
// Body: { scheduledAt, reason, slotWindow? }
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
// `scheduledAt` without `slotWindow` clears the booking's arrival window
// (`slot_window`) and any choice of days the customer offered (`candidate_days`,
// Task 28), because a specific chosen time and an "8am–10am" window can't both
// be true. The app should expect both to be null afterwards and render the
// exact time. This is unchanged for builds that don't send `slotWindow`.
//
// `slotWindow` (OPTIONAL, added in Task 48): the 2-hour arrival window the
// customer picked, exactly as the slots endpoint labels it ("8am–10am" …
// "6pm–8pm", en dash). When it is one of those six labels AND `scheduledAt` is
// that window's start in UK time, the booking keeps it: `slot_window` is that
// label afterwards (and the emails and texts name the window). Anything else,
// including the all-day label, a non-string, or a start that doesn't match, is
// ignored and the move behaves as if it wasn't sent. It never causes an error.
// `candidate_days` is cleared either way.
//
// OWNERSHIP comes from the verified caller, never the path.

interface RescheduleBody {
  scheduledAt?: unknown;
  reason?: unknown;
  slotWindow?: unknown;
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
  const slotWindow = typeof parsed.body.slotWindow === "string" ? parsed.body.slotWindow : null;

  return apiOk(await rescheduleBookingFor(id, scheduledAt, reason, auth.bookingCaller, slotWindow));
}
