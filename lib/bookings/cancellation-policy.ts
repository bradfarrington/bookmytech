import "server-only";

import type { createAdminClient } from "@/lib/supabase/admin";
import { cancelFeeTiers } from "./manage-booking";

// The cancellation policy as a table (Task 54): the tiers on "Cancel this
// booking?" in both clients, and GET /api/mobile/v1/cancellation-policy.
//
// The figures are `cancelFeeTiers`, the same numbers the cancel itself charges
// and the public /cancellation-policy page prints. Only the short labels live
// here; the per-booking fee still comes from /cancel-quote.

export type CancellationTierKey = "before_24h" | "within_24h" | "en_route";

export interface CancellationTier {
  key: CancellationTierKey;
  label: string;
  feePence: number;
}

/** Short labels for a two-column table. The long ones are FEE_LABELS in manage-booking.ts. */
export const CANCELLATION_TIER_LABELS: Record<CancellationTierKey, string> = {
  before_24h: "More than 24 hours before",
  within_24h: "Within 24 hours",
  en_route: "Once your mechanic is on the way",
};

/** The tiers in the order they apply as the slot gets closer, which is cheapest first. */
export async function cancellationPolicy(
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ tiers: CancellationTier[] }> {
  const fees = await cancelFeeTiers(admin);
  return {
    tiers: [
      { key: "before_24h", label: CANCELLATION_TIER_LABELS.before_24h, feePence: fees.before24h },
      { key: "within_24h", label: CANCELLATION_TIER_LABELS.within_24h, feePence: fees.within24h },
      { key: "en_route", label: CANCELLATION_TIER_LABELS.en_route, feePence: fees.enRoute },
    ],
  };
}
