import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { createQuote } from "@/lib/quotes/mechanic";
import type { QuoteLineInput } from "@/lib/quotes/pricing";

// POST /api/mobile/v1/mechanic/bookings/[id]/quotes — price a quote for extra
// work and send it to the customer, in one go. AUTHENTICATED, mechanics only.
// The mobile twin of the website's `createQuoteAction()`; both run
// `createQuote` in lib/quotes/mechanic.ts, so the pricing, the `quote_sent`
// event and the customer's email, SMS and push are identical.
//
// Body: { kind, title?, note?, lines }
//       kind   "now" (extra work on this visit) | "follow_on" (a return visit)
//       lines  QuoteLineInput[] — see lib/quotes/pricing.ts:
//                { kind: "labour", description, hours, nodeId? }
//                { kind: "part" | "other", description, quantity?, unitPence }
//              Prices are worked out HERE. A labour line sends hours, never
//              money; preview with POST …/quotes/preview.
// 200:  { id } — the quote. The app reads it back from `job_quotes` under RLS.
// 400:  a line can't be priced ("Line 2 needs a description.").
// 409:  it can't be quoted right now: the job isn't in progress, or a quote or
//       a revised job is already waiting on the customer.
// 403:  not this mechanic's job.   404: no such job.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.

interface QuoteBody {
  kind?: unknown;
  title?: unknown;
  note?: unknown;
  lines?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = await readJsonBody<QuoteBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);

  const { kind, title, note, lines } = parsed.body;
  const result = await createQuote(auth.caller.userId, {
    bookingId: id,
    kind: kind === "follow_on" ? "follow_on" : "now",
    title: typeof title === "string" ? title : null,
    note: typeof note === "string" ? note : null,
    // The core checks the shape line by line and refuses what it can't price.
    lines: lines as QuoteLineInput[],
  });
  if (!result.ok) return refusalResponse("mechanic/quotes", result);
  return apiOk({ id: result.id });
}
