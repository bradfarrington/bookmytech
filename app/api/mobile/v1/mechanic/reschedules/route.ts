import { revalidatePath } from "next/cache";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiOk, readJsonBody } from "@/lib/mobile/respond";
import { proposeReschedulesFor } from "@/lib/bookings/propose-reschedule";

// POST /api/mobile/v1/mechanic/reschedules — "Running late?": propose a new
// time for several jobs in one call. AUTHENTICATED, mechanics only. The mobile
// twin of the website's `proposeReschedules()` (`proposeReschedulesFor`,
// lib/bookings/propose-reschedule.ts). Each job is proposed exactly as
// POST …/bookings/<id>/reschedule would: nothing moves until that customer
// answers, and each is emailed and texted.
//
// Body: { items: [{ bookingId, newIso }], note? } — up to 20 items; any beyond
//       that are ignored. `note` goes to every customer.
// 200:  { proposed, failed: [{ bookingId, error }] } — PARTIAL SUCCESS IS A 200.
//       A job that can't be moved (not confirmed any more, not this mechanic's,
//       a time in the past) is listed with the sentence it was refused with,
//       and the others still go through.
// 400:  no items.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 400/415, 429, 500.
//
// One request against `mechanic` however many jobs it moves.

interface ReschedulesBody {
  items?: unknown;
  note?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<ReschedulesBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileMechanicCaller(request);
  if (!auth.ok) return auth.response;

  const note = typeof parsed.body.note === "string" ? parsed.body.note.slice(0, 500) : "";
  const result = await proposeReschedulesFor(auth.caller.userId, parsed.body.items, note);
  if (!result.ok) return refusalResponse("mechanic/reschedules", result);

  // The core leaves this to its caller (the website's action does the same).
  revalidatePath("/mechanic/jobs");
  return apiOk({ proposed: result.proposed, failed: result.failed });
}
