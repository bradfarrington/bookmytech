import { cancelBookingFor } from "@/lib/bookings/manage-booking";
import { isUuid, mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";

// POST /api/mobile/v1/bookings/:id/cancel — cancel a booking. AUTHENTICATED.
//
// Body: { reason }
// 200:  { ok: true } | { ok: false, error }. A booking that's past the point of
//       cancelling is a request that RAN with a negative answer. Only
//       transport-level problems return `{ error }` with a non-2xx: 401,
//       400/415 (bad body or id), 429.
//
// Thin wrapper over `cancelBookingFor` — the SAME function the website's
// dashboard calls through app/actions/customer-bookings.ts. It settles the
// pre-authorisation (captures the fee, releases the rest — or cancels the hold
// outright at £0), writes the audit events, and emails and texts both sides.
// None of that is repeated here, or the two clients would disagree about what a
// cancellation costs.
//
// The fee is recomputed inside the core at cancel time. Nothing from
// /cancel-quote is sent, and if it were it would be ignored: the tier depends on
// the clock and the mechanic's status, both of which move between the preview
// and the confirmation.
//
// OWNERSHIP comes from the verified caller, never the path. Knowing a booking's
// UUID is not enough — the core refuses unless the caller is its customer.
//
// THE COOKIE/BEARER TRAP: `cancelBooking` in app/actions/ resolves the caller
// from the cookie session, which a mobile request doesn't have. See
// lib/supabase/mobile.ts.

interface CancelBody {
  reason?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return apiError("We couldn't find that booking.", 400);

  const parsed = await readJsonBody<CancelBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileActionCaller(request, "action");
  if (!auth.ok) return auth.response;

  const reason = typeof parsed.body.reason === "string" ? parsed.body.reason : "";

  return apiOk(await cancelBookingFor(id, reason, auth.bookingCaller));
}
