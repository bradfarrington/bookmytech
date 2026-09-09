import { respondToRevisionFor } from "@/lib/revisions/customer";
import { isUuid, mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";

// POST /api/mobile/v1/bookings/:id/revisions/:revisionId/respond — approve or
// decline a revised job (Task 37). AUTHENTICATED.
//
// Body: { decision: "approve" | "decline" }
// 200:  { ok: true, outcome: "declined" }
//       { ok: true, outcome: "pay", clientSecret, paymentIntentId, amountPence }
//           — the revised job costs more: confirm the intent with PaymentSheet
//           (a manual-capture hold for the DIFFERENCE only, like the booking's
//           own), then POST .../confirm with the paymentIntentId. Nothing is
//           approved until confirm succeeds.
//       { ok: true, outcome: "approved" }
//           — the same price or cheaper: applied at once, nothing to pay now.
//       { ok: false, error }   — expired, withdrawn, not yours…
//
// Thin wrapper over `respondToRevisionFor` — the same function the website uses.

interface Body {
  decision?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; revisionId: string }> },
): Promise<Response> {
  const { id, revisionId } = await params;
  if (!isUuid(id) || !isUuid(revisionId)) return apiError("We couldn't find that revised job.", 400);
  const parsed = await readJsonBody<Body>(request);
  if (!parsed.ok) return parsed.response;
  const decision = parsed.body.decision;
  if (decision !== "approve" && decision !== "decline")
    return apiError("Tell us whether you're approving or declining the revised job.", 400);
  const auth = await mobileActionCaller(request, "action");
  if (!auth.ok) return auth.response;
  return apiOk(await respondToRevisionFor(revisionId, decision, auth.bookingCaller));
}
