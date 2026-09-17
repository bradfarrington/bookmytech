import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { acceptOfferFor } from "@/lib/mechanics/offers";

// POST /api/mobile/v1/mechanic/offers/[id]/accept — take the job. AUTHENTICATED,
// mechanics only. The mobile twin of the website's `acceptOffer()`; both run
// lib/mechanics/offers.ts, so the claim, the superseding of every sibling
// offer, the audit event and the customer's email, SMS and push are identical.
//
// No body.
// 200:  { bookingId, needsArrivalWindow } — `needsArrivalWindow` means the job
//       is all-day (or flexible) and the next screen should be the window
//       picker: GET …/mechanic/bookings/<bookingId>/arrival-windows.
// 409:  another mechanic accepted first, or this offer was already answered.
// 403:  not this mechanic's offer.   404: no such offer.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.
//
// First to accept wins, atomically: two mechanics racing get one 200 and one 409.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That offer no longer exists.", 404);

  const result = await acceptOfferFor(auth.caller.userId, id);
  if (!result.ok) return refusalResponse("mechanic/offers/accept", result);

  return apiOk({ bookingId: result.bookingId, needsArrivalWindow: result.needsArrivalWindow ?? false });
}
