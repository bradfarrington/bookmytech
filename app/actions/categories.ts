"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";

export type CategoryActionResult = { error?: string } | void;

interface ParsedCategoryForm {
  name: string;
  description: string | null;
  displayOrder: number;
  isActive: boolean;
}

function parseForm(
  formData: FormData,
): { ok: true; data: ParsedCategoryForm } | { ok: false; error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const displayOrderRaw = String(formData.get("display_order") ?? "");
  const displayOrder =
    displayOrderRaw === "" ? 0 : Number.parseInt(displayOrderRaw, 10);
  const isActive = formData.get("is_active") === "on";

  if (!name) return { ok: false, error: "Name is required." };
  if (!Number.isFinite(displayOrder) || displayOrder < 0) {
    return {
      ok: false,
      error: "Display order must be a positive whole number.",
    };
  }

  return { ok: true, data: { name, description, displayOrder, isActive } };
}

function revalidateCategorySurfaces() {
  // Settings list + every page that fetches categories for a dropdown
  revalidatePath("/admin/services/settings");
  revalidatePath("/admin/services");
  revalidatePath("/admin/services/new");
}

export async function createCategory(
  formData: FormData,
): Promise<CategoryActionResult> {
  const parsed = parseForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const slug = slugify(parsed.data.name);
  if (!slug) {
    return { error: "Use letters or numbers in the name." };
  }

  const supabase = await createClient();

  // Slug uniqueness — friendlier than the unique-constraint error
  const { data: existing } = await supabase
    .from("service_categories")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existing) {
    return {
      error: `A category with this name already exists (slug "${slug}"). Use a different name.`,
    };
  }

  const { error } = await supabase.from("service_categories").insert({
    name: parsed.data.name,
    slug,
    description: parsed.data.description,
    display_order: parsed.data.displayOrder,
    is_active: parsed.data.isActive,
  });

  if (error) return { error: error.message };

  revalidateCategorySurfaces();
  redirect("/admin/services/settings?flash=category-created");
}

export async function updateCategory(
  id: string,
  formData: FormData,
): Promise<CategoryActionResult> {
  const parsed = parseForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();

  // Slug is intentionally not updated — `services.category` stores the slug as
  // a soft reference, so changing it would break existing service rows.
  const { error } = await supabase
    .from("service_categories")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      display_order: parsed.data.displayOrder,
      is_active: parsed.data.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidateCategorySurfaces();
  redirect("/admin/services/settings?flash=category-updated");
}

export async function setCategoryActive(
  id: string,
  isActive: boolean,
): Promise<CategoryActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("service_categories")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidateCategorySurfaces();
}

export async function reorderCategory(
  id: string,
  direction: "up" | "down",
): Promise<CategoryActionResult> {
  const supabase = await createClient();

  const { data: current, error: currentErr } = await supabase
    .from("service_categories")
    .select("id, display_order")
    .eq("id", id)
    .single();
  if (currentErr || !current) return { error: "Category not found." };

  const base = supabase.from("service_categories").select("id, display_order");
  const { data: neighbour } =
    direction === "up"
      ? await base
          .lt("display_order", current.display_order)
          .order("display_order", { ascending: false })
          .limit(1)
          .maybeSingle()
      : await base
          .gt("display_order", current.display_order)
          .order("display_order", { ascending: true })
          .limit(1)
          .maybeSingle();

  if (!neighbour) return;

  const a = await supabase
    .from("service_categories")
    .update({
      display_order: neighbour.display_order,
      updated_at: new Date().toISOString(),
    })
    .eq("id", current.id);
  if (a.error) return { error: a.error.message };

  const b = await supabase
    .from("service_categories")
    .update({
      display_order: current.display_order,
      updated_at: new Date().toISOString(),
    })
    .eq("id", neighbour.id);
  if (b.error) return { error: b.error.message };

  revalidateCategorySurfaces();
}

// Hard delete — only allowed when no services reference this category's slug.
// We block in the action and surface a count rather than orphaning service rows.
export async function deleteCategory(
  id: string,
): Promise<CategoryActionResult> {
  const supabase = await createClient();

  const { data: category, error: fetchError } = await supabase
    .from("service_categories")
    .select("slug, name")
    .eq("id", id)
    .single();
  if (fetchError || !category) return { error: "Category not found." };

  const { count } = await supabase
    .from("services")
    .select("id", { count: "exact", head: true })
    .eq("category", category.slug);

  if (count && count > 0) {
    return {
      error: `Can't delete "${category.name}" — ${count} ${count === 1 ? "service is" : "services are"} using it. Reassign them first.`,
    };
  }

  const { error } = await supabase
    .from("service_categories")
    .delete()
    .eq("id", id);
  if (error) return { error: error.message };

  revalidateCategorySurfaces();
  redirect("/admin/services/settings?flash=category-deleted");
}
