// Asking Alliance Automotive for one part group on one vehicle (Tasks 40, 45).
//
// Used by a repair's parts on the admin vehicle pages (app/actions/repair-parts.ts).
// It lives outside app/actions because a "use server" file may only export
// server actions, and this must not become a callable endpoint of its own:
// every caller gates on requireAdmin() first.
//
// Refuses to throw. Every failure comes back as a panel state, so AAG being
// down degrades its own panel and never the page.

import { isAagConfigured } from "@/lib/aag/client";
import { fetchAagLiveOffers } from "./aag-live-offers";
import type { SupplierPanel } from "./supplier-offer";

/** A TecDoc part group ("GenArt") as HaynesPro names it on a repair. AAG prices by its id directly. */
export interface AagPartGroup {
  /** The GenArt id, as AAG's CustomerProductGroup takes it. */
  genart: string;
  /** HaynesPro's name for the group, e.g. "Brake disc". */
  label: string;
}

/** NAPA's parts for a part group on a registration: the standard quote, then the full catalogue (Task 76). */
export async function lookupAagPanel(reg: string, group: AagPartGroup): Promise<SupplierPanel> {
  if (!isAagConfigured()) {
    return {
      state: "not_connected",
      message: "NAPA Auto Parts isn't configured on this environment.",
      hint: "Add AAG_API_KEY and AAG_CUSTOMER_ID.",
      href: "/admin/parts/aag-check",
    };
  }

  // This call's own reason, not the shared status row: that row may be another
  // environment's (the sandbox refuses Vercel but answers a local machine).
  const outcome = await fetchAagLiveOffers(reg, group.genart, { includeVehicleDetails: true });
  if (outcome.kind === "failed") {
    return {
      state: "not_connected",
      message: "NAPA Auto Parts didn't return a price.",
      hint: outcome.reason,
      href: "/admin/parts/aag-check",
    };
  }

  const offers = outcome.kind === "ok" ? outcome.offers : [];
  if (offers.length === 0) {
    return {
      state: "empty",
      message: `NAPA Auto Parts listed no ${group.label.toLowerCase()} for this vehicle.`,
    };
  }

  return { state: "ok", offers };
}
