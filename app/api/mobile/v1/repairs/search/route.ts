import {
  MIN_SEARCH_QUERY_LENGTH,
  searchRepairCatalogue,
  type CatalogueSearch,
} from "@/lib/haynespro/catalogue";
import { enforceCatalogueLimits } from "@/lib/mobile/catalogue-limits";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/mobile/v1/repairs/search?reg=…&q=…[&parts=1] — keyword search
// across a vehicle's repair catalogue. Unauthenticated.
//
// ADDITIVE (2026-11-18): `parts=1` prices each hit's parts exactly as
// `/repairs/tree?parts=1` does (`partsPence`, `totalPence`, `partsEstimated`,
// `needsQuote` on the hits). Without it the hits are labour only, as before.
//
// 200: the CatalogueSearch union from lib/haynespro/catalogue.ts, UNCHANGED,
//      including the `{ ok: false, code, message }` arm and `truncated`.
//
// HaynesPro has no keyword search, so we walk the tree and cap the walk. When
// `truncated` is true the results are the closest matches found, NOT a complete
// set, and the app must not present them as one — it renders "Closest matches"
// instead of "Matches" on that flag.
//
// Because a search can cost dozens of upstream calls where a browse costs one,
// it carries its own tighter rate-limit buckets on top of the catalogue ones.
// A query shorter than MIN_SEARCH_QUERY_LENGTH is refused rather than answered:
// it is too broad to be useful and would spend the walk for nothing. The app
// debounces and enforces the same minimum, so a well-behaved client never sees
// this. The website's search box (Task 30) shares the constant.

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const reg = url.searchParams.get("reg")?.trim() ?? "";
  const q = url.searchParams.get("q")?.trim() ?? "";
  const parts = url.searchParams.get("parts")?.trim();
  const priceParts = parts === "1" || parts === "true";

  if (!reg) {
    return apiError("Enter your registration number.", 400);
  }
  if (q.length < MIN_SEARCH_QUERY_LENGTH) {
    return apiError("Type a little more to search for a repair.", 400);
  }

  const limited = await enforceCatalogueLimits(request, { search: true });
  if (limited) return limited;

  const result: CatalogueSearch = await searchRepairCatalogue(
    reg,
    q,
    createAdminClient(),
    { priceParts },
  );
  return apiOk(result);
}
