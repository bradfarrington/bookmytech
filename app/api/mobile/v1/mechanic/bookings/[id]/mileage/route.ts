import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { setJobMileageFor } from "@/lib/mechanics/job-progress";

// POST /api/mobile/v1/mechanic/bookings/[id]/mileage — record the odometer
// reading. AUTHENTICATED, mechanics only. The mobile twin of the website's
// `setJobMileage()` (lib/mechanics/job-progress.ts). A job with a checklist
// can't complete without it.
//
// Body: { mileage } — a whole number of miles, 0 to 1,500,000.
// 200:  {}
// 400:  not a whole number in range.
// 409:  the job isn't active (confirmed, en route or in progress).
// 403:  not this mechanic's job.   404: no such job.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.

interface MileageBody {
  mileage?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = await readJsonBody<MileageBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);

  // The core refuses anything that isn't a whole number; NaN is how a string
  // or a missing field gets there.
  const mileage = typeof parsed.body.mileage === "number" ? parsed.body.mileage : Number.NaN;
  const result = await setJobMileageFor(auth.caller.userId, id, mileage);
  if (!result.ok) return refusalResponse("mechanic/mileage", result);
  return apiOk({});
}
