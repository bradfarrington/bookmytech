"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Admin pricing controls (Task 08 Stage 2). Every mutation:
//   1. verifies the caller is an admin (RLS-aware client),
//   2. reads the current value, writes the new one (service-role client),
//   3. records a pricing_audit_log row (who/what/when, old → new).
//
// Commission + fee changes apply to NEW bookings only — the engine snapshots
// the rate onto each booking at creation (lib/pricing/calculate.ts), so editing
// these never touches existing bookings.

export type PricingResult = { ok: true } | { ok: false; error: string };

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin")
    return { ok: false as const, error: "Admins only." };
  return { ok: true as const, adminId: user.id };
}

type Admin = ReturnType<typeof createAdminClient>;

async function audit(
  admin: Admin,
  actorId: string,
  entity: string,
  entityId: string | null,
  field: string,
  oldValue: unknown,
  newValue: unknown,
) {
  await admin.from("pricing_audit_log").insert({
    actor_id: actorId,
    entity,
    entity_id: entityId,
    field,
    old_value: oldValue ?? null,
    new_value: newValue ?? null,
  });
}

function revalidate() {
  revalidatePath("/admin/pricing");
}

// --- Validation helpers -----------------------------------------------------

/** Pence from a string/number; null if blank, error if not a non-negative int. */
function parsePence(raw: unknown): { ok: true; value: number } | { ok: false } {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return { ok: false };
  return { ok: true, value: n };
}

/** A commission/multiplier rate as a decimal in [min,max]. */
function parseRate(
  raw: unknown,
  min: number,
  max: number,
): { ok: true; value: number } | { ok: false } {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(n) || n < min || n > max) return { ok: false };
  return { ok: true, value: n };
}

// --- Area labour multipliers ------------------------------------------------

export async function createArea(input: {
  name: string;
  prefixes: string[];
  multiplier: number;
}): Promise<PricingResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Area name is required." };
  const parsed = parseRate(input.multiplier, 0.1, 5);
  if (!parsed.ok) return { ok: false, error: "Multiplier must be between 0.1 and 5." };
  const prefixes = input.prefixes
    .map((p) => p.toUpperCase().replace(/\s+/g, ""))
    .filter(Boolean);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("areas")
    .insert({ name, postcode_prefixes: prefixes, labour_multiplier: parsed.value })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Failed to add area." };

  await audit(admin, guard.adminId, "area", data.id, "created", null, {
    name,
    postcode_prefixes: prefixes,
    labour_multiplier: parsed.value,
  });
  revalidate();
  return { ok: true };
}

export async function updateArea(
  areaId: string,
  input: { name?: string; prefixes?: string[]; multiplier?: number; isActive?: boolean },
): Promise<PricingResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const { data: prev } = await admin
    .from("areas")
    .select("name, postcode_prefixes, labour_multiplier, is_active")
    .eq("id", areaId)
    .single();
  if (!prev) return { ok: false, error: "Area not found." };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const changes: Record<string, [unknown, unknown]> = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) return { ok: false, error: "Area name is required." };
    patch.name = name;
    changes.name = [prev.name, name];
  }
  if (input.prefixes !== undefined) {
    const prefixes = input.prefixes
      .map((p) => p.toUpperCase().replace(/\s+/g, ""))
      .filter(Boolean);
    patch.postcode_prefixes = prefixes;
    changes.postcode_prefixes = [prev.postcode_prefixes, prefixes];
  }
  if (input.multiplier !== undefined) {
    const parsed = parseRate(input.multiplier, 0.1, 5);
    if (!parsed.ok) return { ok: false, error: "Multiplier must be between 0.1 and 5." };
    patch.labour_multiplier = parsed.value;
    changes.labour_multiplier = [prev.labour_multiplier, parsed.value];
  }
  if (input.isActive !== undefined) {
    patch.is_active = input.isActive;
    changes.is_active = [prev.is_active, input.isActive];
  }

  const { error } = await admin.from("areas").update(patch).eq("id", areaId);
  if (error) return { ok: false, error: error.message };

  for (const [field, [oldV, newV]] of Object.entries(changes)) {
    await audit(admin, guard.adminId, "area", areaId, field, oldV, newV);
  }
  revalidate();
  return { ok: true };
}

export async function deleteArea(areaId: string): Promise<PricingResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const admin = createAdminClient();
  const { data: prev } = await admin
    .from("areas")
    .select("name")
    .eq("id", areaId)
    .single();
  if (prev?.name === "Default")
    return { ok: false, error: "The Default catch-all area can't be deleted." };

  // Don't orphan priced bookings — block delete if any booking references it.
  const { count } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("area_id", areaId);
  if (count && count > 0)
    return { ok: false, error: `Can't delete — ${count} booking(s) use this area. Deactivate it instead.` };

  const { error } = await admin.from("areas").delete().eq("id", areaId);
  if (error) return { ok: false, error: error.message };

  await audit(admin, guard.adminId, "area", areaId, "deleted", prev?.name ?? null, null);
  revalidate();
  return { ok: true };
}

// --- Platform defaults (commission) + cancellation fee tiers -----------------

const SETTING_KEYS = [
  "take_rate_base",
  "take_rate_pro",
  "hourly_rate_pence",
  "cancel_fee_before_24h",
  "cancel_fee_within_24h",
  "cancel_fee_mechanic_en_route",
] as const;
type SettingKey = (typeof SETTING_KEYS)[number];

export async function updatePlatformSetting(
  key: SettingKey,
  value: number,
): Promise<PricingResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;
  if (!SETTING_KEYS.includes(key)) return { ok: false, error: "Unknown setting." };

  // Commission keys are decimals 0–0.9; everything else is pence (non-negative
  // ints): the hourly rate and the cancellation fees.
  const isRate = key === "take_rate_base" || key === "take_rate_pro";
  if (isRate) {
    const r = parseRate(value, 0, 0.9);
    if (!r.ok) return { ok: false, error: "Rate must be between 0% and 90%." };
    value = r.value;
  } else {
    const p = parsePence(value);
    if (!p.ok) return { ok: false, error: "Enter a whole number of pence." };
    if (key === "hourly_rate_pence" && p.value <= 0)
      return { ok: false, error: "Hourly rate must be greater than £0." };
    value = p.value;
  }

  const admin = createAdminClient();
  const { data: prev } = await admin
    .from("platform_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  const { error } = await admin.from("platform_settings").upsert(
    { key, value, updated_at: new Date().toISOString(), updated_by: guard.adminId },
    { onConflict: "key" },
  );
  if (error) return { ok: false, error: error.message };

  await audit(admin, guard.adminId, "platform_setting", key, key, prev?.value ?? null, value);
  revalidate();
  return { ok: true };
}
