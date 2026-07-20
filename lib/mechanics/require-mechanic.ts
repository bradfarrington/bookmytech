import "server-only";
import { createClient } from "@/lib/supabase/server";

// Shared mechanic guard for server actions (replaces the per-file copies).
//
// "Is a mechanic" = HAS A MECHANICS ROW, not role === 'mechanic' (owner
// decision 2026-07-20): provisioning always creates the row alongside the
// role, and an admin who also works jobs keeps role='admin' with a mechanics
// row granting mechanic access. RLS lets any signed-in user SELECT their own
// mechanics row, so this works from the user-scoped client.
export async function requireMechanic() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: mech } = await supabase
    .from("mechanics")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (!mech) return { ok: false as const, error: "Mechanics only." };
  return { ok: true as const, mechanicId: user.id, supabase };
}
