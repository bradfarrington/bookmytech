"use server";

import { revalidatePath } from "next/cache";
import { requireMechanic } from "@/lib/mechanics/require-mechanic";
import { uploadAvatarFor } from "@/lib/mechanics/avatar";

export type ProfileActionResult = { ok: true } | { ok: false; error: string };

// Availability + profile mutations for the mechanic settings pages (Stage 6).
// Most run under the mechanic's own session: they have a full own-row UPDATE on
// `mechanics` (0004) and a self-update policy on `profiles` + own rows on
// `mechanic_availability` (0010). Avatar upload additionally uses the
// service-role client for the Storage write.

function revalidate() {
  revalidatePath("/mechanic/profile");
  revalidatePath("/mechanic/availability");
  revalidatePath("/mechanic/jobs");
}

// --- Profile (name / phone / bio) ------------------------------------------
export async function updateProfile(input: {
  fullName: string;
  phone: string;
  bio: string;
}): Promise<ProfileActionResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  const { supabase, mechanicId } = guard;

  const fullName = input.fullName.trim();
  if (!fullName) return { ok: false, error: "Your name can't be empty." };

  const { error: pErr } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone: input.phone.trim() || null })
    .eq("id", mechanicId);
  if (pErr) return { ok: false, error: pErr.message };

  const { error: mErr } = await supabase
    .from("mechanics")
    .update({ bio: input.bio.trim() || null })
    .eq("id", mechanicId);
  if (mErr) return { ok: false, error: mErr.message };

  revalidate();
  return { ok: true };
}

// --- Service radius ---------------------------------------------------------
export async function updateServiceRadius(miles: number): Promise<ProfileActionResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;

  const radius = Math.round(miles);
  // 100 is the schema's ceiling (0004) and what the application form and the
  // admin form already allow; the mechanic's own editor used to stop at 20.
  if (!Number.isFinite(radius) || radius < 2 || radius > 100)
    return { ok: false, error: "Pick a radius between 2 and 100 miles." };

  const { error } = await guard.supabase
    .from("mechanics")
    .update({ service_radius_miles: radius })
    .eq("id", guard.mechanicId);
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

// --- Specialisms (service slugs) -------------------------------------------
export async function updateSpecialisms(slugs: string[]): Promise<ProfileActionResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;

  const clean = Array.from(new Set(slugs.map((s) => s.trim()).filter(Boolean)));

  const { error } = await guard.supabase
    .from("mechanics")
    .update({ specialisms: clean })
    .eq("id", guard.mechanicId);
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

// --- Weekly working hours ---------------------------------------------------
export interface AvailabilityRowInput {
  dayOfWeek: number; // 0..6
  isActive: boolean;
  startTime: string | null; // "HH:MM"
  endTime: string | null;
}

export async function updateAvailability(
  rows: AvailabilityRowInput[],
): Promise<ProfileActionResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;

  for (const r of rows) {
    if (r.dayOfWeek < 0 || r.dayOfWeek > 6)
      return { ok: false, error: "Invalid day in the schedule." };
    if (r.isActive && (!r.startTime || !r.endTime))
      return { ok: false, error: "Set a start and end time for each working day." };
    if (r.isActive && r.startTime && r.endTime && r.startTime >= r.endTime)
      return { ok: false, error: "Each day's end time must be after its start time." };
  }

  const payload = rows.map((r) => ({
    mechanic_id: guard.mechanicId,
    day_of_week: r.dayOfWeek,
    is_active: r.isActive,
    start_time: r.isActive ? r.startTime : null,
    end_time: r.isActive ? r.endTime : null,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await guard.supabase
    .from("mechanic_availability")
    .upsert(payload, { onConflict: "mechanic_id,day_of_week" });
  if (error) return { ok: false, error: error.message };

  revalidate();
  return { ok: true };
}

// --- Avatar upload ----------------------------------------------------------
// The WEBSITE's entry point into lib/mechanics/avatar.ts; the mechanic app's is
// POST /api/mobile/v1/mechanic/avatar. Both do the same service-role writes.
export async function uploadAvatar(
  formData: FormData,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;

  const result = await uploadAvatarFor(guard.mechanicId, formData.get("avatar"));
  if (!result.ok) return { ok: false, error: result.error };

  revalidate();
  return { ok: true, url: result.url };
}
