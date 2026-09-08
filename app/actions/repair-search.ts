"use server";

import { headers } from "next/headers";
import {
  MIN_SEARCH_QUERY_LENGTH,
  searchRepairCatalogue,
  type CatalogueNode,
} from "@/lib/haynespro/catalogue";
import { catalogueLimitMessage, catalogueLimitRules } from "@/lib/mobile/catalogue-limits";
import { enforceRateLimits } from "@/lib/rate-limit/limiter";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// The website's repair search (Task 30). Gareth: "a search bar so the
// customer can search for the job they need easier."
//
// Thin wrapper over `searchRepairCatalogue` — the SAME walk behind
// GET /api/mobile/v1/repairs/search — so the website and the app find the same
// jobs at the same prices for the same car. The tree walk is capped and
// `truncated` means "closest matches, not all of them"; the box shows that.
//
// It also counts against the same rate-limit buckets as the mobile route. The
// walk can cost dozens of metered HaynesPro calls, the action is callable by
// anyone with the funnel open, and a bot is a bot whichever client it wears.

export type RepairSearchResult =
  | { ok: true; hits: CatalogueNode[]; truncated: boolean }
  | { ok: false; error: string };

export async function searchRepairsAction(input: {
  reg: string;
  query: string;
}): Promise<RepairSearchResult> {
  const reg = (input.reg ?? "").trim();
  const query = (input.query ?? "").trim();
  if (!reg) return { ok: false, error: "Enter your registration number." };
  if (query.length < MIN_SEARCH_QUERY_LENGTH) return { ok: true, hits: [], truncated: false };

  // Same identity the mobile limiter uses: the signed-in user if there is one
  // (their own bucket), else the address. Vercel rewrites x-forwarded-for at
  // the edge, so the first entry is the real client in production.
  const [hdrs, supabase] = await Promise.all([headers(), createClient()]);
  const forwarded = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || hdrs.get("x-real-ip")?.trim() || "unknown";
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const verdict = await enforceRateLimits(
    catalogueLimitRules({ userId: user?.id ?? null, ip }, { search: true }),
  );
  if (!verdict.allowed) return { ok: false, error: catalogueLimitMessage(verdict.key) };

  const result = await searchRepairCatalogue(reg, query, createAdminClient());
  if (!result.ok) return { ok: false, error: result.message };
  return { ok: true, hits: result.hits, truncated: result.truncated };
}
