import { respondToRescheduleFor } from "@/lib/bookings/manage-booking";
import { isUuid, mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";

// POST /api/mobile/v1/bookings/:id/reschedule-response — the customer's half of
// a MECHANIC-proposed move. AUTHENTICATED.
//
// Body: { decision: "accept" | "decline" }
// 200:  { ok: true } | { ok: false, error }. "There's no reschedule waiting on a
//       response" is a request that RAN with a negative answer — expected
//       whenever the app's copy of the booking is stale. Only transport-level
//       problems return `{ error }` with a non-2xx: 401, 400/415, 429.
//
// Thin wrapper over `respondToRescheduleFor` — the SAME function the website's
// confirmation page and dashboard call through app/actions/customer-bookings.ts.
//
// The app decides whether to OFFER this by reading `reschedule_status`,
// `reschedule_proposed_at` and `reschedule_note` straight off the booking row
// under RLS — a proposal is live when `reschedule_status === 'proposed'`.
//
// OWNERSHIP: unlike the website, this passes a verified caller to the core, so
// ownership IS enforced here. The web path is possession-based on purpose (a
// guest with no account follows their confirmation link), but the app always
// knows who is calling, and a bare booking id must not be enough to accept or
// decline someone else's reschedule.

interface RescheduleResponseBody {
  decision?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return apiError("We couldn't find that booking.", 400);

  const parsed = await readJsonBody<RescheduleResponseBody>(request);
  if (!parsed.ok) return parsed.response;

  const decision = parsed.body.decision;
  if (decision !== "accept" && decision !== "decline") {
    return apiError("Tell us whether you're accepting or declining the new time.", 400);
  }

  const auth = await mobileActionCaller(request, "action");
  if (!auth.ok) return auth.response;

  return apiOk(await respondToRescheduleFor(id, decision, auth.bookingCaller));
}
