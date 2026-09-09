import { confirmRevisionPaymentFor } from "@/lib/revisions/customer";
import { isUuid, mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";

// POST /api/mobile/v1/bookings/:id/revisions/:revisionId/confirm — the card
// has been authorised for the difference; apply the revised job (Task 37).
// AUTHENTICATED.
//
// Body: { paymentIntentId }
// 200:  { ok: true } | { ok: false, error }
//
// The intent is re-read from Stripe and must carry this revision's and this
// caller's ids in its metadata and be at `requires_capture` for the exact
// difference — the body proves nothing on its own. Idempotent.

interface Body {
  paymentIntentId?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; revisionId: string }> },
): Promise<Response> {
  const { id, revisionId } = await params;
  if (!isUuid(id) || !isUuid(revisionId)) return apiError("We couldn't find that revised job.", 400);
  const parsed = await readJsonBody<Body>(request);
  if (!parsed.ok) return parsed.response;
  const paymentIntentId = typeof parsed.body.paymentIntentId === "string" ? parsed.body.paymentIntentId.trim() : "";
  if (!paymentIntentId) return apiError("We couldn't find that payment.", 400);
  const auth = await mobileActionCaller(request, "action");
  if (!auth.ok) return auth.response;
  return apiOk(await confirmRevisionPaymentFor(revisionId, paymentIntentId, auth.bookingCaller));
}
