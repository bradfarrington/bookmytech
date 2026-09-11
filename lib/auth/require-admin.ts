// The admin gate for server actions that expose supplier credentials (Task 42).
//
// Extracted from app/actions/aag.ts, which had it inlined, so the LKQ action and
// any future supplier action share one implementation rather than three
// near-copies.
//
// WHY IT EXISTS AT ALL: a server action is a public endpoint. Being rendered
// inside the admin layout proves nothing about who is calling it — anyone who
// can reach the site can invoke the action directly. Supplier API keys, trade
// prices and account numbers are platform secrets, so the role is checked
// explicitly on every call.
//
// Contrast app/actions/parts.ts, which leans on the "Admins manage parts" RLS
// policy. That is fine for CRUD against a table Postgres is already guarding;
// it is not enough for an action whose side effect is spending a metered API
// credit and returning wholesale pricing.

import { createClient } from "@/lib/supabase/server";

export type AdminGate = { ok: true; userId: string } | { ok: false; error: string };

export async function requireAdmin(): Promise<AdminGate> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") return { ok: false, error: "Admins only." };

  return { ok: true, userId: user.id };
}
