import { listQuotesFor } from "@/lib/quotes/customer";
import { isUuid, mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";

// GET /api/mobile/v1/bookings/:id/quotes — every quote the mechanic has sent
// on this booking (Task 33). AUTHENTICATED.
//
// 200: { ok: true, quotes: QuoteView[] } | { ok: false, error }
//   quote.kind:   "now" (extra work on this visit — approving takes a second
//                 card authorisation) or "follow_on" (a return visit —
//                 approving leads into booking, Task 34)
//   quote.status: "sent" is the one waiting on the customer.
//   lines[]:      { kind: "labour"|"part"|"other", description, hours,
//                   quantity, unitPence, linePence }
//
// The app can also read `job_quotes` / `job_quote_lines` directly under RLS
// (and `job_quotes` is on Realtime); this route exists for a stateless fetch.
// Thin wrapper over `listQuotesFor` — the same function the website uses.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return apiError("We couldn't find that booking.", 400);
  const auth = await mobileActionCaller(request, "action");
  if (!auth.ok) return auth.response;
  return apiOk(await listQuotesFor(id, auth.bookingCaller));
}
