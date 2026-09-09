import { listRevisionsFor } from "@/lib/revisions/customer";
import { isUuid, mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk } from "@/lib/mobile/respond";

// GET /api/mobile/v1/bookings/:id/revisions — every revised job the mechanic
// has proposed on this booking (Task 37). AUTHENTICATED.
//
// 200: { ok: true, revisions: RevisionView[] } | { ok: false, error }
//   revision.status:  "sent" is the one waiting on the customer.
//   revision.before / .after: the job sheet as booked and as revised —
//     { repairIds, lines[{nodeId, description, chargedHours, linePence, kind}],
//       parts[{name, quantity, unitPence, linePence}], repairDescription,
//       serviceDurationHours, totalPence, … }
//   revision.differencePence: after − before. Positive = approving authorises
//     that amount on the card (respond → "pay"); zero or negative = nothing to
//     authorise (respond → "approved" at once).
//
// The app can also read `job_revisions` directly under RLS (and it is on
// Realtime); this route exists for a stateless fetch. Thin wrapper over
// `listRevisionsFor` — the same function the website uses.

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return apiError("We couldn't find that booking.", 400);
  const auth = await mobileActionCaller(request, "action");
  if (!auth.ok) return auth.response;
  return apiOk(await listRevisionsFor(id, auth.bookingCaller));
}
