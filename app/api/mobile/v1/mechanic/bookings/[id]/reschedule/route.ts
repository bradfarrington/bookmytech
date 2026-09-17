import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { proposeRescheduleFor } from "@/lib/bookings/propose-reschedule";

// POST /api/mobile/v1/mechanic/bookings/[id]/reschedule — propose a new time
// to the customer. AUTHENTICATED, mechanics only. The mobile twin of the
// website's `proposeReschedule()` (lib/bookings/propose-reschedule.ts). Nothing
// moves yet: the proposal sits on the booking (`reschedule_status`,
// `reschedule_proposed_at`, `reschedule_note`) until the customer answers, and
// they are emailed and texted.
//
// Body: { newIso, note? } — `newIso` is an exact instant in the future.
// 200:  {}
// 400:  not a date, or in the past.
// 409:  only a confirmed job that hasn't started can be moved.
// 403:  not this mechanic's job.   404: no such job.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.

interface RescheduleBody {
  newIso?: unknown;
  note?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const parsed = await readJsonBody<RescheduleBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That job no longer exists.", 404);

  const newIso = typeof parsed.body.newIso === "string" ? parsed.body.newIso : "";
  const note = typeof parsed.body.note === "string" ? parsed.body.note.slice(0, 500) : "";

  const result = await proposeRescheduleFor(auth.caller.userId, id, newIso, note);
  if (!result.ok) return refusalResponse("mechanic/reschedule", result);
  // The core leaves this to its caller (the website's action does the same).
  revalidatePath("/mechanic/jobs");
  revalidatePath(`/mechanic/jobs/${id}`);
  return apiOk({});
}
