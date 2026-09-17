"use server";

import { createClient } from "@/lib/supabase/server";
import { setAvailabilityFor } from "@/lib/mechanics/availability";

export type MechanicStatusResult =
  | { ok: true; status: "online" | "offline" }
  | { ok: false; error: string };

// The mechanic flips their own availability from the dashboard top bar. Runs
// under their session so RLS ("Mechanics can update own status", 0004) applies
// — we never need the service-role client here.
//
// The rules (payouts gate, online_at, redispatch) live in
// lib/mechanics/availability.ts, shared with the mechanic app's
// POST /api/mobile/v1/mechanic/status. This action only resolves the mechanic
// from the cookie session.
export async function setOwnAvailability(
  status: "online" | "offline",
): Promise<MechanicStatusResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const result = await setAvailabilityFor(supabase, user.id, status);
  if (result.ok) return { ok: true, status: result.status };

  // The website can point at where to fix it; the app has its own screen.
  if (result.refused === "no_payouts") {
    return { ok: false, error: `${result.error.replace(/\.$/, "")}: Settings → Get paid.` };
  }
  return { ok: false, error: result.error };
}
