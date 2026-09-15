import { enforceBookingLimits, requireMobileCustomer } from "@/lib/mobile/booking-guards";
import { apiOk } from "@/lib/mobile/respond";
import { setDefaultCard } from "@/lib/payments/saved-cards";

// POST /api/mobile/v1/account/payment-methods/:id/default — make a saved card
// the default (Task 53). AUTHENTICATED, customer accounts only. No body.
//
// 200: { ok: true, cards } | { ok: false, error }
//      `cards` is the list afterwards, in the GET shape.
//
// The id must be a card on the CALLER'S Stripe Customer. Thin wrapper over
// lib/payments/saved-cards.ts.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  const auth = await requireMobileCustomer(request);
  if (!auth.ok) return auth.response;

  const limited = await enforceBookingLimits(request, auth.caller, "account");
  if (limited) return limited;

  return apiOk(await setDefaultCard(auth.caller.userId, id));
}
