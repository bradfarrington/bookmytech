import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { withdrawQuote } from "@/lib/quotes/mechanic";

// POST /api/mobile/v1/mechanic/quotes/[quoteId]/withdraw — take back a quote
// the customer hasn't answered. AUTHENTICATED, mechanics only. The mobile twin
// of the website's `withdrawQuoteAction()` (`withdrawQuote`,
// lib/quotes/mechanic.ts). A card hold the customer had started is released. A
// quote waiting on the customer blocks completion, so this is also how a
// mechanic unblocks "Complete".
//
// No body.
// 200:  {}
// 409:  the quote isn't waiting on the customer any more (answered, expired,
//       already withdrawn).
// 403:  somebody else's quote.   404: no such quote.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.

export async function POST(
  request: Request,
  { params }: { params: Promise<{ quoteId: string }> },
): Promise<Response> {
  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { quoteId } = await params;
  if (!isUuid(quoteId)) return apiError("That quote no longer exists.", 404);

  const result = await withdrawQuote(auth.caller.userId, quoteId);
  if (!result.ok) return refusalResponse("mechanic/quotes/withdraw", result);
  return apiOk({});
}
