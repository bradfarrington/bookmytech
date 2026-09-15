// Asking Alliance Automotive for one part group on one vehicle (Tasks 40, 45).
//
// Used by a repair's parts on the admin vehicle pages (app/actions/repair-parts.ts).
// It lives outside app/actions because a "use server" file may only export
// server actions, and this must not become a callable endpoint of its own:
// every caller gates on requireAdmin() first.
//
// Refuses to throw. Every failure comes back as a panel state, so AAG being
// down degrades its own panel and never the page.

import { aagQuote, isAagConfigured } from "@/lib/aag/client";
import { readAagHealth } from "@/lib/aag/health";
import { flattenQuote } from "@/lib/aag/quote";
import { createAdminClient } from "@/lib/supabase/admin";
import { aagOffers, type SupplierPanel } from "./supplier-offer";

/** A TecDoc part group ("GenArt") as HaynesPro names it on a repair. AAG prices by its id directly. */
export interface AagPartGroup {
  /** The GenArt id, as AAG's CustomerProductGroup takes it. */
  genart: string;
  /** HaynesPro's name for the group, e.g. "Brake disc". */
  label: string;
}

/** One AAG quote for a part group on a registration. */
export async function lookupAagPanel(reg: string, group: AagPartGroup): Promise<SupplierPanel> {
  if (!isAagConfigured()) {
    return {
      state: "not_connected",
      message: "Alliance Automotive isn't configured on this environment.",
      hint: "Add AAG_API_KEY and AAG_CUSTOMER_ID.",
      href: "/admin/parts/aag-check",
    };
  }

  const body = await aagQuote(reg, group.genart);
  if (!body) {
    let hint: string | null = "The connection check shows what Alliance Automotive last told us.";
    try {
      const health = await readAagHealth(createAdminClient());
      if (health?.detail) hint = health.detail;
    } catch {
      // Keep the default explanation.
    }
    return {
      state: "not_connected",
      message: "Alliance Automotive didn't return a price.",
      hint,
      href: "/admin/parts/aag-check",
    };
  }

  const offers = aagOffers(flattenQuote(body));
  if (offers.length === 0) {
    return {
      state: "empty",
      message: `Alliance Automotive listed no ${group.label.toLowerCase()} for this vehicle.`,
    };
  }

  return { state: "ok", offers };
}
