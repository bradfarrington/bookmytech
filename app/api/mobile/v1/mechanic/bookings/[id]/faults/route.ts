import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { addFault } from "@/lib/quotes/mechanic";

// POST /api/mobile/v1/mechanic/bookings/[id]/faults — note a fault found on
// the car. AUTHENTICATED, mechanics only. The mobile twin of the website's
// `addFaultAction()` (`addFault`, lib/quotes/mechanic.ts): same `fault_added`
// event, and the customer sees it on their booking.
//
// Body: { description, severity? } — up to 500 characters; `severity` is
//       "advisory" (the default, and what anything else becomes) or "urgent".
// 200:  { id } — the fault. The app reads `booking_faults` itself under RLS.
// 400:  no description, or too long.
// 409:  the job isn't active (confirmed, en route or in progress).
// 403:  not this mechanic's job.   404: no such job.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.
//
// To quote for it, send its id as `faultId` on a line of POST …/quotes.

interface FaultBody {
  description?: unknown;
  severity?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = await readJsonBody<FaultBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);

  const { description, severity } = parsed.body;
  const result = await addFault(auth.caller.userId, {
    bookingId: id,
    description: typeof description === "string" ? description : "",
    severity: typeof severity === "string" ? severity : undefined,
  });
  if (!result.ok) return refusalResponse("mechanic/faults", result);
  return apiOk({ id: result.id });
}
