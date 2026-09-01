import { listModels } from "@/lib/haynespro/vehicle-picker";
import { PICKER_UNAVAILABLE, readIdParam } from "@/lib/mobile/vehicle-picker-response";
import { enforceCatalogueLimits } from "@/lib/mobile/catalogue-limits";
import { apiError, apiOk } from "@/lib/mobile/respond";

// GET /api/mobile/v1/vehicle/models?makeId=<int> — a make's models. Step two of
// "wrong car?". Unauthenticated, same reasoning and same buckets as /makes.
//
// 200: { ok: true, models: [{ id, name, madeFrom, madeUntil, image }] }
//    | { ok: false, code: "unavailable", message }
//
// `madeFrom`/`madeUntil` are HaynesPro's own strings ("2011", "2019") and are
// the whole point of showing models rather than names alone: a make lists four
// vehicles called "Ranger" and the customer tells them apart by era.

export async function GET(request: Request): Promise<Response> {
  const makeId = readIdParam(new URL(request.url), "makeId");
  if (makeId == null) return apiError("Please choose a make.", 400);

  const limited = await enforceCatalogueLimits(request);
  if (limited) return limited;

  const models = await listModels(makeId);
  return apiOk(models ? { ok: true as const, models } : PICKER_UNAVAILABLE);
}
