import { cancellationPolicy } from "@/lib/bookings/cancellation-policy";
import { apiError, apiOk } from "@/lib/mobile/respond";
import { createAdminClient } from "@/lib/supabase/admin";

// GET /api/mobile/v1/cancellation-policy — the cancellation fee tiers, for the
// policy table on "Cancel this booking?". PUBLIC (no token): it's the same
// information as the website's /cancellation-policy page.
//
// 200: { tiers: [{ key, label, feePence }] }
//      key: "before_24h" | "within_24h" | "en_route", in that order (the order
//      they apply as the slot gets closer, which is cheapest first).
//
// Thin wrapper over lib/bookings/cancellation-policy.ts, which reads
// `cancelFeeTiers`: the same figures the cancel itself charges. The fee for a
// particular booking still comes from GET /bookings/:id/cancel-quote.

export async function GET(): Promise<Response> {
  try {
    return apiOk(await cancellationPolicy(createAdminClient()));
  } catch (err) {
    console.error("[cancellation-policy] failed", err);
    return apiError("We couldn't load the cancellation policy. Please try again.", 503);
  }
}
