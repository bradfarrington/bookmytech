import { listTypes } from "@/lib/haynespro/vehicle-picker";
import { PICKER_UNAVAILABLE, readIdParam } from "@/lib/mobile/vehicle-picker-response";
import { enforceCatalogueLimits } from "@/lib/mobile/catalogue-limits";
import { apiError, apiOk } from "@/lib/mobile/respond";

// GET /api/mobile/v1/vehicle/types?modelId=<int> — a model's engine variants.
// Step three of "wrong car?", and the one that matters: THIS is the level the
// labour times, and therefore the price, come from. Unauthenticated, same
// reasoning and same buckets as /makes.
//
// 200: { ok: true, types: [{ id, name, fullName, engineCode, fuelType,
//        capacity, outputKw, outputBhp, madeFrom, madeUntil }] }
//    | { ok: false, code: "unavailable", message }
//
// `outputKw` AND `outputBhp`: HaynesPro's `output` is kW, and a UK customer
// picking their car reads bhp. Sending one number called "output" would have
// printed a 283 bhp Model 3 as "211".
//
// Two variants of one model can share a name (a Model 3 lists "Long Range AWD"
// twice, at different outputs) — `id` is the identity, never the name.

export async function GET(request: Request): Promise<Response> {
  const modelId = readIdParam(new URL(request.url), "modelId");
  if (modelId == null) return apiError("Please choose a model.", 400);

  const limited = await enforceCatalogueLimits(request);
  if (limited) return limited;

  const types = await listTypes(modelId);
  return apiOk(types ? { ok: true as const, types } : PICKER_UNAVAILABLE);
}
