import { confirmQuotePaymentFor } from "@/lib/quotes/customer";
import { isUuid, mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";

// POST /api/mobile/v1/bookings/:id/quotes/:quoteId/confirm — the card has
// been authorised for the quote; approve it (Task 33). AUTHENTICATED.
//
// Body: { paymentIntentId }
// 200:  { ok: true } | { ok: false, error }
//
// The intent is re-read from Stripe and must carry this quote's and this
// caller's ids in its metadata and be at `requires_capture` for the quote's
// exact amount — the body proves nothing on its own. Idempotent.

interface Body {
  paymentIntentId?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; quoteId: string }> },
): Promise<Response> {
  const { id, quoteId } = await params;
  if (!isUuid(id) || !isUuid(quoteId)) return apiError("We couldn't find that quote.", 400);
  const parsed = await readJsonBody<Body>(request);
  if (!parsed.ok) return parsed.response;
  const paymentIntentId = typeof parsed.body.paymentIntentId === "string" ? parsed.body.paymentIntentId.trim() : "";
  if (!paymentIntentId) return apiError("We couldn't find that payment.", 400);
  const auth = await mobileActionCaller(request, "action");
  if (!auth.ok) return auth.response;
  return apiOk(await confirmQuotePaymentFor(quoteId, paymentIntentId, auth.bookingCaller));
}
