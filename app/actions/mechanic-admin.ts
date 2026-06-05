"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applySuspension, liftMechanicSuspension } from "@/lib/mechanics/suspend";

export type MechanicAdminResult = { ok: true } | { ok: false; error: string };

// Admin-only mechanic account actions (Task 12 Stage 1): suspend / un-suspend.
// Same guard shape as app/actions/bookings.ts — confirm the caller is an admin,
// then mutate via service-role.
async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { ok: false as const, error: "Admins only." };
  return { ok: true as const, adminId: user.id };
}

export async function suspendMechanic(
  mechanicId: string,
  reason: string,
  suspendedUntil: string | null,
): Promise<MechanicAdminResult> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "A reason is required to suspend a mechanic." };

  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  // Validate an optional end date.
  let until: string | null = null;
  if (suspendedUntil) {
    const d = new Date(suspendedUntil);
    if (Number.isNaN(d.getTime())) return { ok: false, error: "That end date isn't valid." };
    if (d.getTime() <= Date.now()) return { ok: false, error: "The end date must be in the future." };
    until = d.toISOString();
  }

  const admin = createAdminClient();
  const { data: mech } = await admin.from("mechanics").select("id").eq("id", mechanicId).maybeSingle();
  if (!mech) return { ok: false, error: "Mechanic not found." };

  await applySuspension(admin, mechanicId, trimmed, until, guard.adminId);
  revalidatePath(`/admin/mechanics/${mechanicId}`);
  revalidatePath("/admin/mechanics");
  return { ok: true };
}

export async function liftSuspension(mechanicId: string): Promise<MechanicAdminResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  await liftMechanicSuspension(admin, mechanicId, guard.adminId);
  revalidatePath(`/admin/mechanics/${mechanicId}`);
  revalidatePath("/admin/mechanics");
  return { ok: true };
}
