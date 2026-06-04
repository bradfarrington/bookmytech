"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type MechanicStatusResult =
  | { ok: true; status: "online" | "offline" }
  | { ok: false; error: string };

// The mechanic flips their own availability from the dashboard top bar. Runs
// under their session so RLS ("Mechanics can update own status", 0004) applies
// — we never need the service-role client here.
//
// We deliberately only expose 'online' / 'offline' to the toggle. 'on_job' is
// set by the lifecycle actions when a job is in progress, not by the mechanic
// manually.
export async function setOwnAvailability(
  status: "online" | "offline",
): Promise<MechanicStatusResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Gate: a mechanic can't go online until Stripe payouts are enabled —
  // otherwise we'd dispatch jobs we can't pay them for (Task 08 Stage 3).
  if (status === "online") {
    const { data: mechanic } = await supabase
      .from("mechanics")
      .select("stripe_payouts_enabled")
      .eq("id", user.id)
      .single();
    if (!mechanic?.stripe_payouts_enabled) {
      return {
        ok: false,
        error: "Connect your bank account before going online — Settings → Get paid.",
      };
    }
  }

  const now = new Date().toISOString();
  const patch: Record<string, string> = { status, last_seen_at: now };
  // Stamp online_at only on the offline→online transition so it reflects the
  // start of the current session, not every heartbeat.
  if (status === "online") patch.online_at = now;

  const { error } = await supabase
    .from("mechanics")
    .update(patch)
    .eq("id", user.id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/mechanic/jobs");
  return { ok: true, status };
}
