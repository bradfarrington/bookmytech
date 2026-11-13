import { loadCustomQuote } from "@/lib/custom-quotes/server";
import { ownsCustomQuote, toCustomQuoteView } from "@/lib/custom-quotes/model";
import { enforceBookingLimits, requireMobileCustomer } from "@/lib/mobile/booking-guards";
import { isUuid } from "@/lib/mobile/customer-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/mobile/v1/custom-quotes/:id — one custom quote (Task 75), e.g. from
// the link in the quote email (https://bookmytech.co.uk/book/quote/:id).
// AUTHENTICATED, customer accounts only.
//
// 200: { quote: CustomQuoteView } (shape in GET /custom-quotes)
// 404: not found, or not the caller's (sent to another email address)

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return apiError("We couldn't find that quote.", 404);
  const auth = await requireMobileCustomer(request);
  if (!auth.ok) return auth.response;
  const limited = await enforceBookingLimits(request, auth.caller, "account");
  if (limited) return limited;

  const row = await loadCustomQuote(createAdminClient(), id);
  if (!row || !ownsCustomQuote(row, { userId: auth.caller.userId, email: auth.caller.email })) {
    return apiError("We couldn't find that quote.", 404);
  }
  return apiOk({ quote: toCustomQuoteView(row) });
}
