import { prepareCheckoutFor } from "@/lib/bookings/create-booking";
import { enforceBookingLimits, staffRefusal } from "@/lib/mobile/booking-guards";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { requireMobileUser } from "@/lib/supabase/mobile";

// POST /api/mobile/v1/checkout/prepare — price the job, apply credit, open the
// pre-auth hold. AUTHENTICATED.
//
// Body: { postcode, vehicleReg, repairNodeId }
// 200:  the PrepareCheckoutResult from lib/bookings/create-booking.ts,
//       UNCHANGED — including the `{ ok: false, error }` arm. A repair we can't
//       price, or a Stripe refusal, is a request that RAN with a negative
//       answer, not a failed request, and the app types against that union.
//       Only transport-level problems return `{ error }` with a non-2xx:
//       401 (no/expired token), 403 (staff account), 400/415 (bad body), 429.
//
// Thin wrapper over `prepareCheckoutFor` — the SAME function the website's
// checkout calls through app/actions/create-booking.ts. Everything that decides
// money happens in there: the price is re-quoted from (reg, node) server-side,
// the credit is read from the ledger, and the amount held is (total − credit).
// No figure in the request body is trusted, because none is read.
//
// The hold is a MANUAL-CAPTURE PaymentIntent: nothing is taken now, it's
// captured when the job completes, and an unconfirmed intent costs nothing and
// expires on its own. `clientSecret` is what the app's PaymentSheet confirms, and
// it belongs to the same Stripe account as the publishable key the app ships
// with — both come from this deployment's STRIPE_* environment.
//
// THE COOKIE/BEARER TRAP: the caller is resolved from the verified Bearer token
// and passed to the core explicitly. Reaching for the cookie client here would
// resolve to null and silently price the booking with NO account credit — a
// wrong answer, not an error. See lib/supabase/mobile.ts.

interface PrepareBody {
  postcode?: unknown;
  vehicleReg?: unknown;
  repairNodeId?: unknown;
}

const asString = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<PrepareBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await requireMobileUser(request);
  if (!auth.ok) return apiError(auth.error, auth.status);
  const caller = auth.caller;

  const refusal = staffRefusal(caller);
  if (refusal) return refusal;

  const postcode = asString(parsed.body.postcode).toUpperCase();
  const vehicleReg = asString(parsed.body.vehicleReg);
  const repairNodeId = asString(parsed.body.repairNodeId);

  if (!vehicleReg) {
    return apiError("We need your registration number to price this repair.", 400);
  }
  if (!repairNodeId) {
    return apiError("Choose the repair you need first.", 400);
  }
  if (!postcode) {
    return apiError("Enter the postcode we're coming to.", 400);
  }

  const limited = await enforceBookingLimits(request, caller, "checkout");
  if (limited) return limited;

  const result = await prepareCheckoutFor({ postcode, vehicleReg, repairNodeId }, caller.userId);
  return apiOk(result);
}
