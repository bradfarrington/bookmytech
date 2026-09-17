import "server-only";

// The caller of a MECHANIC route (app/api/mobile/v1/mechanic/**) — the mechanic
// app's counterpart to `requireMobileCustomer`.

import { apiError } from "@/lib/mobile/respond";
import { requireMobileUser, type MobileCaller } from "@/lib/supabase/mobile";

/** The caller's own `mechanics` row, as their session is allowed to read it. */
export interface MobileMechanicRow {
  id: string;
  status: "offline" | "online" | "on_job";
  service_radius_miles: number;
  base_postcode: string | null;
  bio: string | null;
  specialisms: string[];
  rating: number;
  job_count: number;
  is_pro: boolean;
  approved_at: string | null;
  online_at: string | null;
  last_seen_at: string | null;
  stripe_account_id: string | null;
  stripe_onboarding_complete: boolean;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  is_suspended: boolean;
  suspended_until: string | null;
  /** Their own daily earnings target (0083). Null = none set. */
  daily_goal_pence: number | null;
  /** When a timed offline ends (0083). Set by the status route, never by the app. */
  resume_online_at: string | null;
  created_at: string;
  updated_at: string;
}

export type MobileMechanicResult =
  | { ok: true; caller: MobileCaller; mechanic: MobileMechanicRow }
  | { ok: false; response: Response };

/**
 * `requireMobileUser`, then: does this account have a `mechanics` row?
 *
 * "Is a mechanic" = HAS THE ROW, not `role === 'mechanic'` — the same rule as
 * lib/mechanics/require-mechanic.ts and proxy.ts. An admin who also works jobs
 * keeps `role = 'admin'`, and the row is what grants them mechanic access. Read
 * with the caller's own client: RLS lets a user select their own row and nobody
 * else's, so a customer's token finds nothing and gets the 403.
 */
export async function requireMobileMechanic(request: Request): Promise<MobileMechanicResult> {
  const auth = await requireMobileUser(request);
  if (!auth.ok) return { ok: false, response: apiError(auth.error, auth.status) };

  const { data: mechanic, error } = await auth.caller.supabase
    .from("mechanics")
    .select("*")
    .eq("id", auth.caller.userId)
    .maybeSingle();
  if (error) {
    console.error("[mobile/mechanic] mechanics lookup failed", error);
    return { ok: false, response: apiError("Something went wrong. Please try again.", 500) };
  }
  if (!mechanic) {
    return { ok: false, response: apiError("This account isn't set up as a mechanic.", 403) };
  }

  return { ok: true, caller: auth.caller, mechanic: mechanic as MobileMechanicRow };
}
