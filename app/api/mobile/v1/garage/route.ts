import { addToGarage, listGarage } from "@/lib/garage/garage";
import { enforceBookingLimits, requireMobileCustomer } from "@/lib/mobile/booking-guards";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";

// The garage (Task 50). AUTHENTICATED, customer accounts only.
//
// GET  /api/mobile/v1/garage
//   200: { available, vehicles: [{ id, registration, displayRegistration,
//          nickname, make, model, colour, fuelType, yearOfManufacture,
//          motStatus, motExpiryDate, taxStatus, taxDueDate, detailsCheckedAt,
//          createdAt }] }
//        Oldest first. DVLA details that are due a refresh (weekly, daily
//        once MOT or tax is within 30 days) are refreshed before answering, a
//        few vehicles per call. `available` is false before migration 0073.
//        Dates are "YYYY-MM-DD". The app can drop its own 24-hour DVLA cache.
//
// POST /api/mobile/v1/garage   Body: { registration, nickname? }
//   200: { ok: true, vehicle, alreadySaved } | { ok: false, error }
//        Checks the registration with DVLA first. Adding a vehicle that's
//        already there returns it with alreadySaved: true.
//
// Renaming and removing are DIRECT under RLS, no endpoint:
//   supabase.from('customer_vehicles').update({ nickname }).eq('id', id)
//   supabase.from('customer_vehicles').delete().eq('id', id)
// (0073 grants customers UPDATE on `nickname` only.)
//
// Thin wrapper over lib/garage/garage.ts, which the website's garage uses. The
// customer comes from the verified token, never the body.

export async function GET(request: Request): Promise<Response> {
  const auth = await requireMobileCustomer(request);
  if (!auth.ok) return auth.response;

  const limited = await enforceBookingLimits(request, auth.caller, "account");
  if (limited) return limited;

  const result = await listGarage(auth.caller.userId);
  if (!result.ok) return apiError(result.error, 503);
  return apiOk({ available: result.available, vehicles: result.vehicles });
}

interface AddBody {
  registration?: unknown;
  nickname?: unknown;
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await readJsonBody<AddBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await requireMobileCustomer(request);
  if (!auth.ok) return auth.response;

  const limited = await enforceBookingLimits(request, auth.caller, "account");
  if (limited) return limited;

  return apiOk(
    await addToGarage(auth.caller.userId, {
      registration: parsed.body.registration,
      nickname: parsed.body.nickname,
    }),
  );
}
