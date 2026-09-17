import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { previewQuote } from "@/lib/quotes/mechanic";

// POST /api/mobile/v1/mechanic/bookings/[id]/quotes/preview — what a quote
// WOULD come to. Nothing is saved and nobody is told. AUTHENTICATED, mechanics
// only.
//
// This is how the app shows "Customer pays £90 · You earn £76.50" while the
// mechanic types, without owning the labour rate, the commission or a copy of
// lib/quotes/pricing.ts. Priced by the same function, with the same settings,
// as POST …/quotes — the platform's hourly rate and this BOOKING's commission.
//
// Body: { lines: QuoteLineInput[] } — as POST …/quotes.
// 200:  { lines: [{ linePence }], totalPence, platformFeePence,
//         mechanicPayoutPence, hourlyRatePence } — `lines` in the order sent.
// 400:  { error } — a line can't be priced yet, and the sentence says which
//       ("Line 2 needs a description."). Expected while typing: show it or
//       keep the last good figures, but don't treat it as a failure.
// 403:  not this mechanic's job.   404: no such job.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.
//
// `mechanicfeed`, because it is called on every edit.

interface PreviewBody {
  lines?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = await readJsonBody<PreviewBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request, "mechanicfeed");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);

  const result = await previewQuote(auth.caller.userId, id, parsed.body.lines);
  if (!result.ok) return refusalResponse("mechanic/quotes/preview", result);
  return apiOk({
    lines: result.lines,
    totalPence: result.totalPence,
    platformFeePence: result.platformFeePence,
    mechanicPayoutPence: result.mechanicPayoutPence,
    hourlyRatePence: result.hourlyRatePence,
  });
}
