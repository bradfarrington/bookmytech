import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { markPartStatusFor } from "@/lib/mechanics/part-sourcing";

// POST /api/mobile/v1/mechanic/booking-parts/[partId]/status — where a part
// has got to. AUTHENTICATED, mechanics only. The mobile twin of the website's
// `markPartStatus()` (`markPartStatusFor`, lib/mechanics/part-sourcing.ts).
// "ordered" and "delivered" stamp `ordered_at` / `delivered_at`.
//
// Body: { status: "ordered" | "delivered" | "used" }
// 200:  {}
// 400:  not one of the three.
// 403:  not this mechanic's job.   404: no such part.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.
//
// The order isn't enforced here, as it isn't on the website: it records where
// the part is, and gates nothing.

interface StatusBody {
  status?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ partId: string }> },
): Promise<Response> {
  const parsed = await readJsonBody<StatusBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { partId } = await params;
  if (!isUuid(partId)) return apiError("Part not found.", 404);

  const result = await markPartStatusFor(auth.caller.userId, partId, parsed.body.status);
  if (!result.ok) return refusalResponse("mechanic/parts/status", result);
  return apiOk({});
}
