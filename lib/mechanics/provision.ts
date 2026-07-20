import "server-only";
import type { createAdminClient } from "@/lib/supabase/admin";

// Shared mechanic account provisioning (approvals + admin "create mechanic").
//
// Owner decision 2026-07-20: an applicant's email may already have an account —
// a customer becoming a mechanic, or an ADMIN who also works jobs. In both
// cases we REUSE the existing auth user instead of failing:
//
//   - customer → profile role flips to 'mechanic'; their customer history
//     (bookings, disputes, reviews, credits) stays linked to the same user id.
//   - admin    → role stays 'admin' (they keep the console); the mechanics row
//     alone grants mechanic access ("is a mechanic" = has a mechanics row —
//     see lib/mechanics/require-mechanic.ts).
//   - already a mechanic → error; nothing to provision twice.
//
// Rollback rules differ by path: a user we CREATED is deleted on failure; a
// user we REUSED is never deleted — we only revert the role flip.

type AdminClient = ReturnType<typeof createAdminClient>;

export interface ProvisionInput {
  email: string;
  fullName: string;
  phone?: string | null;
  basePostcode?: string | null;
  serviceRadiusMiles?: number | null;
  specialisms?: string[] | null;
  bio?: string | null;
}

export type ProvisionResult =
  | { ok: true; userId: string; reused: boolean; existingRole: string | null }
  | { ok: false; error: string };

/** Find an existing auth user by email (no getUserByEmail in auth-js). */
async function findUserByEmail(admin: AdminClient, email: string) {
  const needle = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return null;
    const hit = data.users.find((u) => u.email?.toLowerCase() === needle);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
  return null;
}

export async function ensureMechanicAccount(
  admin: AdminClient,
  input: ProvisionInput,
): Promise<ProvisionResult> {
  const email = input.email.trim().toLowerCase();
  const mechanicsRow = {
    base_postcode: input.basePostcode ?? null,
    service_radius_miles: input.serviceRadiusMiles ?? 10,
    specialisms: input.specialisms ?? [],
    ...(input.bio !== undefined ? { bio: input.bio } : {}),
    approved_at: new Date().toISOString(),
  };

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });

  // --- Fresh account -------------------------------------------------------
  if (!createErr && created.user) {
    const userId = created.user.id;
    // The handle_new_user trigger auto-inserts a profile with role='customer'.
    const { error: profileErr } = await admin
      .from("profiles")
      .update({ role: "mechanic", full_name: input.fullName, phone: input.phone ?? null })
      .eq("id", userId);
    if (profileErr) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return { ok: false, error: `Couldn't set up profile: ${profileErr.message}` };
    }
    const { error: mechErr } = await admin
      .from("mechanics")
      .insert({ id: userId, ...mechanicsRow });
    if (mechErr) {
      await admin.auth.admin.deleteUser(userId).catch(() => {});
      return { ok: false, error: `Couldn't create mechanic profile: ${mechErr.message}` };
    }
    return { ok: true, userId, reused: false, existingRole: null };
  }

  const msg = createErr?.message ?? "Failed to create user.";
  if (!msg.toLowerCase().includes("registered")) return { ok: false, error: msg };

  // --- Email already has an account: reuse it ------------------------------
  const existing = await findUserByEmail(admin, email);
  if (!existing) {
    return { ok: false, error: "A user with that email already exists, but it couldn't be looked up." };
  }
  const userId = existing.id;

  const { data: mech } = await admin
    .from("mechanics")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (mech) return { ok: false, error: "That email already belongs to a mechanic account." };

  const { data: profile } = await admin
    .from("profiles")
    .select("role, full_name, phone")
    .eq("id", userId)
    .maybeSingle();
  const existingRole = profile?.role ?? null;

  if (existingRole === "admin") {
    // Admins stay admins — only fill in profile gaps, never downgrade the role.
    const gaps: Record<string, string> = {};
    if (!profile?.full_name && input.fullName) gaps.full_name = input.fullName;
    if (!profile?.phone && input.phone) gaps.phone = input.phone;
    if (Object.keys(gaps).length) {
      await admin.from("profiles").update(gaps).eq("id", userId);
    }
  } else {
    const { error: profileErr } = await admin
      .from("profiles")
      .update({ role: "mechanic", full_name: input.fullName, phone: input.phone ?? null })
      .eq("id", userId);
    if (profileErr) {
      return { ok: false, error: `Couldn't set up profile: ${profileErr.message}` };
    }
  }

  const { error: mechErr } = await admin
    .from("mechanics")
    .insert({ id: userId, ...mechanicsRow });
  if (mechErr) {
    // Reused account: never delete the user — just undo the role flip.
    if (existingRole && existingRole !== "admin") {
      await admin.from("profiles").update({ role: existingRole }).eq("id", userId);
    }
    return { ok: false, error: `Couldn't create mechanic profile: ${mechErr.message}` };
  }

  return { ok: true, userId, reused: true, existingRole };
}
