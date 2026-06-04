"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";

// Multi-city area tooling actions (Task 10 Stage 3). Run under the admin session
// (areas has an admin-manage RLS policy from 0016).

export type AreaActionResult = { error?: string } | void;

export interface CreateAreaInput {
  name: string;
  postcodePrefixes: string[];
  labourMultiplier: number;
  status: "active" | "planned" | "paused";
  targetMechanicCount: number | null;
  referralCode: string | null;
  recruitmentHeadline: string | null;
  recruitmentBlurb: string | null;
  acquisitionBudgetPence: number | null;
  launchChecklist: Record<string, boolean>;
}

function cleanPrefixes(prefixes: string[]): string[] {
  return [...new Set(
    prefixes
      .map((p) => p.trim().toUpperCase().replace(/\s+/g, ""))
      .filter(Boolean),
  )];
}

export async function createArea(
  input: CreateAreaInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = input.name?.trim();
  if (!name) return { ok: false, error: "Area name is required." };

  const multiplier = Number(input.labourMultiplier);
  if (!Number.isFinite(multiplier) || multiplier < 0.5 || multiplier > 3) {
    return { ok: false, error: "Labour multiplier must be between 0.5 and 3.0." };
  }

  const supabase = await createClient();

  // Unique slug from the name (append a numeric suffix on clash).
  const base = slugify(name) || "area";
  let slug = base;
  for (let n = 2; n < 50; n++) {
    const { data: clash } = await supabase
      .from("areas")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!clash) break;
    slug = `${base}-${n}`;
  }

  const status = input.status;
  const { data, error } = await supabase
    .from("areas")
    .insert({
      name,
      slug,
      postcode_prefixes: cleanPrefixes(input.postcodePrefixes),
      labour_multiplier: multiplier,
      // is_active is the pricing-engine gate — only active areas price bookings.
      is_active: status === "active",
      status,
      target_mechanic_count: input.targetMechanicCount,
      referral_code: input.referralCode?.trim() || null,
      recruitment_headline: input.recruitmentHeadline?.trim() || null,
      recruitment_blurb: input.recruitmentBlurb?.trim() || null,
      acquisition_budget_pence: input.acquisitionBudgetPence,
      launch_checklist: input.launchChecklist ?? {},
    })
    .select("id")
    .single();

  if (error || !data) {
    if (error?.code === "23505") return { ok: false, error: "An area with that name already exists." };
    return { ok: false, error: error?.message ?? "Failed to create area." };
  }

  revalidatePath("/admin/areas");
  return { ok: true, id: data.id };
}

export async function setAreaStatus(
  id: string,
  status: "active" | "planned" | "paused",
): Promise<AreaActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("areas")
    .update({
      status,
      // Keep the engine gate in lockstep: only an active area prices bookings.
      is_active: status === "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/areas");
  revalidatePath(`/admin/areas/${id}`);
}

export interface UpdateAreaInput {
  labourMultiplier?: number;
  targetMechanicCount?: number | null;
  recruitmentHeadline?: string | null;
  recruitmentBlurb?: string | null;
  postcodePrefixes?: string[];
}

export async function updateArea(id: string, patch: UpdateAreaInput): Promise<AreaActionResult> {
  const supabase = await createClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.labourMultiplier !== undefined) {
    const m = Number(patch.labourMultiplier);
    if (!Number.isFinite(m) || m < 0.5 || m > 3) return { error: "Multiplier must be 0.5–3.0." };
    update.labour_multiplier = m;
  }
  if (patch.targetMechanicCount !== undefined) update.target_mechanic_count = patch.targetMechanicCount;
  if (patch.recruitmentHeadline !== undefined) update.recruitment_headline = patch.recruitmentHeadline;
  if (patch.recruitmentBlurb !== undefined) update.recruitment_blurb = patch.recruitmentBlurb;
  if (patch.postcodePrefixes !== undefined) update.postcode_prefixes = cleanPrefixes(patch.postcodePrefixes);

  const { error } = await supabase.from("areas").update(update).eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/areas/${id}`);
  revalidatePath("/admin/areas");
}

/** Wizard submit: create then redirect to the new area's dashboard. */
export async function createAreaAndRedirect(input: CreateAreaInput): Promise<{ error: string } | void> {
  const res = await createArea(input);
  if (!res.ok) return { error: res.error };
  redirect(`/admin/areas/${res.id}?flash=area-created`);
}
