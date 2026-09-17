import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { setArrivalWindowFor } from "@/lib/mechanics/set-arrival-window";

// POST /api/mobile/v1/mechanic/bookings/[id]/arrival-window — narrow an all-day
// (or flexible) job to a 2-hour window. AUTHENTICATED, mechanics only. The
// mobile twin of the website's `setArrivalWindow()`; both run
// lib/mechanics/set-arrival-window.ts, so the customer gets the same email, SMS
// and push.
//
// Body: { window, dayKey? } — `window` is one of the labels from
//       GET …/arrival-windows ("10am–12pm"). `dayKey` ("YYYY-MM-DD") is
//       REQUIRED for a flexible booking — which of the offered days — and
//       optional otherwise.
// 200:  {}
// 400:  not one of the windows / days.
// 409:  can't be set now, and the message says why: overlaps another job, the
//       window has started, already confirmed, job under way, a reschedule is
//       pending, or the job changed while they were choosing. One shot — a
//       confirmed window is moved by proposing a new time, not by calling again.
// 403:  not this mechanic's job.   404: no such job.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 415, 429, 500.

interface ArrivalWindowBody {
  window?: unknown;
  dayKey?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = await readJsonBody<ArrivalWindowBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);

  const { window, dayKey } = parsed.body;
  if (typeof window !== "string") return apiError("Pick one of the arrival windows.", 400);
  if (dayKey !== undefined && dayKey !== null && typeof dayKey !== "string") {
    return apiError("Pick one of the days.", 400);
  }

  const result = await setArrivalWindowFor(auth.caller.userId, id, window, dayKey ?? undefined);
  if (!result.ok) return refusalResponse("mechanic/arrival-window", result);

  return apiOk({});
}
