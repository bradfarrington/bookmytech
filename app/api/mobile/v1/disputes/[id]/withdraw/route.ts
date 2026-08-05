import { withdrawDisputeFor } from "@/lib/disputes/core";
import { isUuid, mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";

// POST /api/mobile/v1/disputes/:id/withdraw — close a dispute you raised.
// AUTHENTICATED. No body.
//
// 200: { ok: true } | { ok: false, error }. "Only the person who opened the
//      dispute can withdraw it" and "this dispute is already closed" are
//      requests that RAN with a negative answer. Only transport-level problems
//      return `{ error }` with a non-2xx: 401, 400 (bad id), 429.
//
// Thin wrapper over `withdrawDisputeFor` — the SAME function the website calls
// through app/actions/disputes.ts. Withdrawing closes the case with NO refund,
// puts the booking back to `completed` and releases the mechanic's held payout.
// It is the "sorted it between us" outcome; anything involving money goes
// through admin arbitration, which this app deliberately cannot reach.
//
// It is not undoable, and the booking already carries its one dispute
// (`unique(booking_id)`), so a withdrawn case cannot be reopened — worth the app
// confirming before it posts.
//
// OWNERSHIP is doubly checked in the core: the caller must be a party to the
// dispute AND the person who opened it.
//
// No body means no `Content-Type: application/json` check to lean on, so the
// Bearer requirement is doing that work alone. It holds: this endpoint reads no
// cookie, so a browser on another origin has no ambient credential to replay,
// and the token itself is not something a cross-origin page can obtain.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return apiError("We couldn't find that dispute.", 400);

  const auth = await mobileActionCaller(request, "action");
  if (!auth.ok) return auth.response;

  return apiOk(await withdrawDisputeFor(id, auth.caller.userId));
}
