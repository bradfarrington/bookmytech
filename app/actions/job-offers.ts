"use server";

import { requireMechanic } from "@/lib/mechanics/require-mechanic";
import { acceptOfferFor, declineOfferFor } from "@/lib/mechanics/offers";

export type OfferActionResult =
  | {
      ok: true;
      bookingId?: string;
      /**
       * The accepted booking is an ALL-DAY one, so the mechanic should be taken
       * straight to the job page to pick a 2-hour arrival window (Task 21).
       */
      needsArrivalWindow?: boolean;
    }
  | { ok: false; error: string };

// The work lives in lib/mechanics/offers.ts, shared with the mechanic app's
// route handlers. These actions only resolve the mechanic from the cookie
// session (RLS-aware client).
export async function acceptOffer(offerId: string): Promise<OfferActionResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  const result = await acceptOfferFor(guard.mechanicId, offerId);
  return result.ok ? result : { ok: false, error: result.error };
}

export async function declineOffer(offerId: string): Promise<OfferActionResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  const result = await declineOfferFor(guard.mechanicId, offerId);
  return result.ok ? result : { ok: false, error: result.error };
}
