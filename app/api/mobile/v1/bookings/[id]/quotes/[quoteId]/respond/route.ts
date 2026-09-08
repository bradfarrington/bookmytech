import { respondToQuoteFor } from "@/lib/quotes/customer";
import { isUuid, mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";

// POST /api/mobile/v1/bookings/:id/quotes/:quoteId/respond — approve or
// decline a quote (Task 33). AUTHENTICATED.
//
// Body: { decision: "approve" | "decline" }
// 200:  { ok: true, outcome: "declined" }
//       { ok: true, outcome: "pay", clientSecret, paymentIntentId, amountPence }
//           — extra work on this visit: confirm the intent with PaymentSheet
//           (it is a manual-capture hold, like the booking's own), then POST
//           .../confirm with the paymentIntentId. Nothing is approved until
//           confirm succeeds.
//       { ok: true, outcome: "book", quoteId }
//           — a return visit: open the booking flow with this quote (Task 34).
//       { ok: true, outcome: "approved" }   — already done
//       { ok: false, error }                — expired, withdrawn, not yours…
//
// Thin wrapper over `respondToQuoteFor` — the same function the website uses.

interface Body {
  decision?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; quoteId: string }> },
): Promise<Response> {
  const { id, quoteId } = await params;
  if (!isUuid(id) || !isUuid(quoteId)) return apiError("We couldn't find that quote.", 400);
  const parsed = await readJsonBody<Body>(request);
  if (!parsed.ok) return parsed.response;
  const decision = parsed.body.decision;
  if (decision !== "approve" && decision !== "decline")
    return apiError("Tell us whether you're approving or declining the quote.", 400);
  const auth = await mobileActionCaller(request, "action");
  if (!auth.ok) return auth.response;
  return apiOk(await respondToQuoteFor(quoteId, decision, auth.bookingCaller));
}
