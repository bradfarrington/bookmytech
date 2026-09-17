import { isUuid } from "@/lib/mobile/customer-actions";
import { mobileMechanicCaller, refusalResponse } from "@/lib/mobile/mechanic-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { mechanicDisputeViewFor } from "@/lib/disputes/mechanic-view";

// GET /api/mobile/v1/mechanic/disputes/[id] — a dispute as the app's screen
// needs it. AUTHENTICATED, mechanics only, and only the mechanic on the
// disputed job.
//
// 200:  `MechanicDisputeView` (lib/disputes/mechanic-view.ts): the job's number
//       and service, the customer as "Marcus B", labels for the status, reason
//       and resolution, `escalatesAt` (when Book My Tech steps in by itself;
//       null once it has, or the dispute is closed), `payoutLine` once
//       resolved, and
//         can: { reply, escalate, withdraw }
//       `withdraw` is only ever true on an issue the mechanic raised themselves.
// 403:  not a party to it.   404: no such dispute.
//       Otherwise `{ error }`: 401, 403 (not a mechanic), 429, 500.
//
// The thread itself is read from `dispute_messages` under RLS, which never
// returns a note Book My Tech wrote for the customer alone (0085).
//
// Those three are everything a mechanic can do to a dispute. Only Book My Tech
// decides one: there is no route, here or anywhere, by which a mechanic accepts,
// offers, settles, refunds or resolves.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await mobileMechanicCaller(request, "mechanicfeed");
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isUuid(id)) return apiError("That dispute no longer exists.", 404);

  const result = await mechanicDisputeViewFor(auth.caller.userId, id);
  if (!result.ok) return refusalResponse("mechanic/disputes", result);
  const { ok, ...view } = result;
  void ok;
  return apiOk(view);
}
