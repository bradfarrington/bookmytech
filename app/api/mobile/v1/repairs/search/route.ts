import { searchRepairCatalogue, type CatalogueSearch } from "@/lib/haynespro/catalogue";
import { enforceCatalogueLimits } from "@/lib/mobile/catalogue-limits";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/mobile/v1/repairs/search?reg=…&q=… — keyword search across a
// vehicle's repair catalogue. Unauthenticated.
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
// A query shorter than MIN_QUERY_LENGTH is refused rather than answered: it is
// too broad to be useful and would spend the walk for nothing. The app debounces
// and enforces the same minimum, so a well-behaved client never sees this.

/** Keep in sync with MIN_QUERY_LENGTH in the app's book/repairs screen. */
const MIN_QUERY_LENGTH = 3;

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const reg = url.searchParams.get("reg")?.trim() ?? "";
  const q = url.searchParams.get("q")?.trim() ?? "";

  if (!reg) {
    return apiError("Enter your registration number.", 400);
  }
  if (q.length < MIN_QUERY_LENGTH) {
    return apiError("Type a little more to search for a repair.", 400);
  }

  const limited = await enforceCatalogueLimits(request, { search: true });
  if (limited) return limited;

  const result: CatalogueSearch = await searchRepairCatalogue(
    reg,
    q,
    createAdminClient(),
  );
  return apiOk(result);
}
