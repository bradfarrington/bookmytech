import { getRepairCatalogueLevel, type CatalogueLevel } from "@/lib/haynespro/catalogue";
import { enforceCatalogueLimits } from "@/lib/mobile/catalogue-limits";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/mobile/v1/repairs/tree?reg=…&node=… — one level of the repair
// catalogue for a vehicle. Unauthenticated.
//
// 200: the CatalogueLevel union from lib/haynespro/catalogue.ts, UNCHANGED —
//      including the `{ ok: false, code, message }` arm. Same convention as
//      /vehicle/lookup: a vehicle we can't match, or one with no repair-time
//      data, is a successful request with a negative answer, not a failure, and
//      the app types against that union. Only transport-level problems (missing
//      reg, rate limit) return `{ error }` with a non-2xx status.
//
// Omit `node` for the top-level groups; pass a group's id to drill in. Nodes
// with `kind: "group"` are navigation, `kind: "repair"` are bookable and
// priced.
//
// `parts=1` (Task 63) also prices each bookable row's supplier parts, adding
// `partsPence` and `totalPence` to those nodes — labour plus the parts that job
// needs on this car, which is what the customer pays if they book it on its
// own. It is a PARAMETER rather than always-on because pricing a whole level
// costs a supplier lookup per part group the first time a registration is seen.
// A build that doesn't render the total shouldn't wait for it, and every build
// already on a phone is such a build.
//
// A row whose parts have no usable price carries NEITHER field — deliberately
// absent, not zero. Render the old "£X + parts" there: a quote for that job
// would refuse the booking, so labour alone is not what the customer pays.
//
// The admin client is deliberate and safe: nothing here is user data. It reads
// the public catalogue and writes the shared reg → car-type cache, exactly as
// the website's RepairBrowser server component does. No mobile request may
// reach cookie-derived auth (lib/supabase/server.ts) — see docs/tasks/18.

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const reg = url.searchParams.get("reg")?.trim() ?? "";
  const node = url.searchParams.get("node")?.trim() || null;
  const parts = url.searchParams.get("parts")?.trim();
  const priceParts = parts === "1" || parts === "true";

  if (!reg) {
    return apiError("Enter your registration number.", 400);
  }

  const limited = await enforceCatalogueLimits(request);
  if (limited) return limited;

  const result: CatalogueLevel = await getRepairCatalogueLevel(
    reg,
    node,
    createAdminClient(),
    { priceParts },
  );
  return apiOk(result);
}
