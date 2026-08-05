import { quoteCancellationFor } from "@/lib/bookings/manage-booking";
import { isUuid, mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";

// GET /api/mobile/v1/bookings/:id/cancel-quote — what cancelling would cost.
// AUTHENTICATED.
//
// 200: the CancellationQuote from lib/bookings/manage-booking.ts, UNCHANGED —
//      { ok: true, feePence, tier, label, totalPence } | { ok: false, error }.
//      "This booking can no longer be cancelled" is a request that RAN with a
//      negative answer, not a failed request. Only transport-level problems
//      return `{ error }` with a non-2xx: 401, 400 (bad id), 429.
//
// This is a SEPARATE call from /cancel on purpose. The app has to put a number
// next to "Cancel this booking?" — nobody can decide without one.
//
// It is a PREVIEW and nothing more. /cancel recomputes the fee at cancel time
// and never reads this, because the tier genuinely moves: the 24-hour boundary
// passes, the mechanic sets off. The app should show what /cancel reports it
// actually charged, not what this said a minute earlier.
//
// THE COOKIE/BEARER TRAP: the caller comes from the verified Bearer token and is
// passed to the core explicitly. `quoteCancellation` in app/actions/ resolves it
// from the cookie session, which a mobile request doesn't have — called from
// here it would refuse every request with "Please sign in." See
// lib/supabase/mobile.ts.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return apiError("We couldn't find that booking.", 400);

  const auth = await mobileActionCaller(request, "action");
  if (!auth.ok) return auth.response;

  return apiOk(await quoteCancellationFor(id, auth.bookingCaller));
}
