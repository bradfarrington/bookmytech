import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { openResolutionCaseFor } from "@/lib/resolutions/core";

// POST /api/mobile/v1/mechanic/cases — "Get help": raise a case with Book My
// Tech about one of the caller's jobs. AUTHENTICATED, mechanics only. The
// mobile twin of the website's `openResolutionCase()`; both run
// `openResolutionCaseFor` (lib/resolutions/core.ts), so the `resolution_opened`
// event and the email to Book My Tech are identical.
//
// A case is INTERNAL — mechanic and Book My Tech. The customer never sees it
// and is never told. (A disagreement WITH the customer is a dispute:
// POST …/mechanic/bookings/<id>/disputes.)
//
// Body: { bookingId, reasonId, description, photos? }
//       reasonId     an active row of `resolution_reasons`, which the app reads
//                    under RLS
//       description  20 to 2000 characters
//       photos       up to 6 URLs from POST …/mechanic/cases/photos. Anything
//                    that isn't the caller's own upload is dropped.
// 200:  { caseId }
// 400:  no reason, or the description is too short or too long.
// 403:  not this mechanic's job.   404: no such job.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.
//
// Always as a MECHANIC, even for an admin who also works jobs: in the core
// `role: "admin"` means any job and any case, which is the console's power and
// not the app's.

interface CaseBody {
  bookingId?: unknown;
  reasonId?: unknown;
  description?: unknown;
  photos?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<CaseBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { bookingId, reasonId, description, photos } = parsed.body;
  if (typeof bookingId !== "string" || !isUuid(bookingId)) return apiError("That job no longer exists.", 404);
  if (typeof reasonId !== "string" || !isUuid(reasonId)) return apiError("Pick a reason.", 400);

  const result = await openResolutionCaseFor(
    { bookingId, reasonId, description: typeof description === "string" ? description : "", photos },
    { userId: auth.caller.userId, role: "mechanic" },
  );
  if (!result.ok) return refusalResponse("mechanic/cases", result);
  return apiOk({ caseId: result.caseId });
}
