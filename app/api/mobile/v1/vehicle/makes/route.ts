import { listMakes } from "@/lib/haynespro/vehicle-picker";
import { PICKER_UNAVAILABLE } from "@/lib/mobile/vehicle-picker-response";
import { enforceCatalogueLimits } from "@/lib/mobile/catalogue-limits";
import { apiOk } from "@/lib/mobile/respond";

// GET /api/mobile/v1/vehicle/makes — every car make HaynesPro knows (~89,
// alphabetical). Step one of "wrong car?". Unauthenticated.
//
// 200: { ok: true, makes: [{ id, name }] }
//    | { ok: false, code: "unavailable", message } — the same 200-with-a-
//      negative-answer convention as /repairs/tree and /vehicle/lookup.
//
// Unauthenticated to match /repairs/tree and /quote: the app lets guests price
// a job, and correcting the vehicle happens at step 1 of the funnel, long
// before the account gate. It is memoised for a day upstream and costs nothing
// per call — but it is public, so it counts against the same catalogue buckets
// as the rest of the HaynesPro-backed reads.

export async function GET(request: Request): Promise<Response> {
  const limited = await enforceCatalogueLimits(request);
  if (limited) return limited;

  const makes = await listMakes();
  return apiOk(makes ? { ok: true as const, makes } : PICKER_UNAVAILABLE);
}
