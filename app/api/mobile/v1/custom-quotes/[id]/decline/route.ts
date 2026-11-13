import { declineCustomQuote } from "@/lib/custom-quotes/server";
import { isUuid, mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";

// POST /api/mobile/v1/custom-quotes/:id/decline — decline a custom quote, or
// cancel a request we're still pricing (Task 75). AUTHENTICATED. No body.
//
// 200: { ok: true } | { ok: false, error }  (show `error` verbatim)
//
// Same function as the website's Decline button; the admin is emailed.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return apiError("We couldn't find that quote.", 400);
  const auth = await mobileActionCaller(request, "action");
  if (!auth.ok) return auth.response;
  return apiOk(await declineCustomQuote(id, { userId: auth.caller.userId, email: auth.caller.email }));
}
