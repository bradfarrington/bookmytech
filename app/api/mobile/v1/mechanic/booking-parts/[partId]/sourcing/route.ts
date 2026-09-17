import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { setPartSourcingFor } from "@/lib/mechanics/part-sourcing";

// POST /api/mobile/v1/mechanic/booking-parts/[partId]/sourcing — who gets this
// part: the mechanic ("self") or Book My Tech ("bmt"). AUTHENTICATED, mechanics
// only. The mobile twin of the website's `setPartSourcing()`
// (lib/mechanics/part-sourcing.ts).
//
// A BMT-sourced part is money the platform keeps, so switching changes the
// mechanic's take-home and nothing else — the customer's price and the
// commission don't move.
//
// Body: { sourcing: "self" | "bmt" }
// 200:  { payoutPence } — their take-home for the job afterwards; the same
//       figure as `money.payoutPence` on GET …/bookings/<id>/job.
// 400:  not one of the two.
// 403:  not this mechanic's job.   404: no such part.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.

interface SourcingBody {
  sourcing?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ partId: string }> },
): Promise<Response> {
  const parsed = await readJsonBody<SourcingBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { partId } = await params;
  if (!isUuid(partId)) return apiError("Part not found.", 404);

  const result = await setPartSourcingFor(auth.caller.userId, partId, parsed.body.sourcing);
  if (!result.ok) return refusalResponse("mechanic/sourcing", result);
  return apiOk({ payoutPence: result.payoutPence });
}
