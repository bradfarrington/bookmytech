import { enforceBookingLimits, requireMobileCustomer } from "@/lib/mobile/booking-guards";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { listSavedCards, startAddingCard } from "@/lib/payments/saved-cards";

// Saved cards (Task 53). AUTHENTICATED, customer accounts only.
//
// GET  /api/mobile/v1/account/payment-methods
//   200: { cards: [{ id, brand, last4, expMonth, expYear, holderName, isDefault }] }
//        Newest first. When there are cards, exactly one is the default.
//   503: { error } when Stripe can't be reached.
//
// POST /api/mobile/v1/account/payment-methods   (no body)
//   Start adding a card.
//   200: { ok: true, setupIntentClientSecret, customerId,
//          customerSessionClientSecret } | { ok: false, error }
//        Give all three to PaymentSheet in setup mode:
//          initPaymentSheet({ setupIntentClientSecret, customerId,
//                             customerSessionClientSecret, … })
//        customerSessionClientSecret may be null (the sheet still works; it
//        just won't list existing cards). Stripe attaches the card to the
//        customer when the sheet succeeds, so there's no confirm call: fetch
//        the list again.
//
// Remove and make default: POST …/payment-methods/:id/remove and …/:id/default.
//
// Checkout uses these automatically: /checkout/prepare adds `customerId` and
// `customerSessionClientSecret` (additive) when the customer has a saved card.
//
// Thin wrapper over lib/payments/saved-cards.ts, which the website's Payment
// methods page uses. The customer comes from the verified token.

export async function GET(request: Request): Promise<Response> {
  const auth = await requireMobileCustomer(request);
  if (!auth.ok) return auth.response;

  const limited = await enforceBookingLimits(request, auth.caller, "account");
  if (limited) return limited;

  const result = await listSavedCards(auth.caller.userId);
  if (!result.ok) return apiError(result.error, 503);
  return apiOk({ cards: result.cards });
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireMobileCustomer(request);
  if (!auth.ok) return auth.response;

  const limited = await enforceBookingLimits(request, auth.caller, "account");
  if (limited) return limited;

  // The name Stripe shows against the customer. Read under the caller's own RLS.
  const { data: profile } = await auth.caller.supabase
    .from("profiles")
    .select("full_name")
    .eq("id", auth.caller.userId)
    .maybeSingle();

  return apiOk(
    await startAddingCard(
      {
        userId: auth.caller.userId,
        email: auth.caller.email,
        name: (profile?.full_name as string | null | undefined) ?? null,
      },
      "mobile",
    ),
  );
}
