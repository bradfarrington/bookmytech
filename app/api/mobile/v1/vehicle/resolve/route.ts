import { applyManualVehicleSelection } from "@/lib/haynespro/vehicle-picker";
import { mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { createAdminClient } from "@/lib/supabase/admin";

// POST /api/mobile/v1/vehicle/resolve — point a registration at the car type
// the customer picked, instead of the one our fuzzy matcher guessed.
// AUTHENTICATED.
//
// Body: { reg, carTypeId }   — carTypeId from GET /vehicle/types.
// 200:  { ok: true, vehicle: { description, hourlyRatePence } }
//     | { ok: false, code, error }
//       codes: make_mismatch | no_coverage | type_unknown | vehicle_unknown |
//              unavailable. All are requests that RAN with a negative answer.
//       Only transport-level problems return `{ error }` non-2xx: 401, 415/400,
//       429.
//
// `vehicle` is the SAME shape /repairs/tree returns, so the app reuses its
// existing type and re-fetches the tree straight after — every price it then
// shows, including the one the server re-quotes at booking time, is the
// corrected vehicle's.
//
// WHY THIS ONE IS AUTHENTICATED WHEN THE THREE PICKER READS ARE NOT: those are
// public reads of a supplier's catalogue; this is a WRITE to shared pricing
// state. `haynespro_vehicle_cache` is keyed on the reg alone with no customer
// scoping, so a correction moves that plate's price for everyone who books it,
// on the website too. That is the correct behaviour — it is the right car — and
// it is also why it takes a verified caller, its own tight rate-limit bucket,
// the DVLA make guard inside `applyManualVehicleSelection`, and an audit trail
// (`resolved_by` is the TOKEN's user, never anything in the body).
//
// The admin client is deliberate and safe, exactly as in /repairs/tree: the
// vehicle cache is not user data and has no RLS policies, and no mobile request
// may reach cookie-derived auth (docs/tasks/18).

interface ResolveBody {
  reg?: unknown;
  carTypeId?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<ResolveBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileActionCaller(request, "vehicle");
  if (!auth.ok) return auth.response;

  const reg = typeof parsed.body.reg === "string" ? parsed.body.reg.trim() : "";
  if (!reg) return apiError("Enter your registration number.", 400);

  const { carTypeId } = parsed.body;
  if (typeof carTypeId !== "number" || !Number.isSafeInteger(carTypeId) || carTypeId <= 0) {
    return apiError("Please choose your vehicle from the list.", 400);
  }

  return apiOk(
    await applyManualVehicleSelection(
      { reg, carTypeId, callerId: auth.caller.userId },
      createAdminClient(),
    ),
  );
}
