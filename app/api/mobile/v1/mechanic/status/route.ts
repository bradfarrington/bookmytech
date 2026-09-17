import { enforceBookingLimits } from "@/lib/mobile/booking-guards";
import { requireMobileMechanic } from "@/lib/mobile/mechanic-guards";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { setAvailabilityFor } from "@/lib/mechanics/availability";

// POST /api/mobile/v1/mechanic/status — go online or offline. AUTHENTICATED,
// mechanics only. The mobile twin of the website's `setOwnAvailability()`; both
// run lib/mechanics/availability.ts.
//
// Body: { status: "online" | "offline" }
// 200:  { status }
// 409:  { error } — refused, and the message says why: no payouts yet
//       ("Connect your bank account before going online."), suspended, or
//       currently on a job.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.
//
// Going online re-offers every booking still waiting for a mechanic, which is
// why the app comes here rather than writing `status` itself.

interface StatusBody {
  status?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<StatusBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await requireMobileMechanic(request);
  if (!auth.ok) return auth.response;

  const limited = await enforceBookingLimits(request, auth.caller, "mechanic");
  if (limited) return limited;

  const { status } = parsed.body;
  if (status !== "online" && status !== "offline") {
    return apiError("Something went wrong. Please update the app and try again.", 400);
  }

  const result = await setAvailabilityFor(auth.caller.supabase, auth.caller.userId, status);
  if (result.ok) return apiOk({ status: result.status });
  if (result.refused) return apiError(result.error, 409);

  console.error("[mechanic/status] update failed", result.error);
  return apiError("We couldn't update your status. Please try again in a moment.", 500);
}
