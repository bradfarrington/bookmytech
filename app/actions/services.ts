"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";
import { getHourlyRatePence } from "@/lib/pricing/calculate";

export type ServiceActionResult = { error?: string } | void;

interface ParsedForm {
  name: string;
  category: string;
  description: string | null;
  durationHours: number;
  displayOrder: number;
  isActive: boolean;
}

/** Parse a duration string in hours: positive, up to 2dp (matches numeric(4,2)). */
function parseDuration(raw: string): number | null {
  const n = Number(raw.trim());
  if (!Number.isFinite(n) || n <= 0 || n > 99.99) return null;
  return Math.round(n * 100) / 100;
}

/** Cached indicative price = round(duration × global hourly rate). */
function cachedPricePence(durationHours: number, hourlyRatePence: number): number {
  return Math.round(durationHours * hourlyRatePence);
}

function parseForm(formData: FormData): { ok: true; data: ParsedForm } | { ok: false; error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const durationHours = parseDuration(String(formData.get("duration") ?? ""));
  const displayOrderRaw = String(formData.get("display_order") ?? "");
  const displayOrder = displayOrderRaw === "" ? 0 : Number.parseInt(displayOrderRaw, 10);
  const isActive = formData.get("is_active") === "on";

  if (!name) return { ok: false, error: "Name is required." };
  if (!category) return { ok: false, error: "Choose a category." };
  if (durationHours === null) {
    return { ok: false, error: "Enter a valid duration in hours (greater than 0)." };
  }
  if (!Number.isFinite(displayOrder) || displayOrder < 0) {
    return { ok: false, error: "Display order must be a positive whole number." };
  }

  return {
    ok: true,
    data: { name, category, description, durationHours, displayOrder, isActive },
  };
}

function revalidateServiceSurfaces() {
  // Admin list + landing-page services preview both read this table
  revalidatePath("/admin/services");
  revalidatePath("/");
}

export async function createService(formData: FormData): Promise<ServiceActionResult> {
  const parsed = parseForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const slug = slugify(parsed.data.name);
  if (!slug) {
    return { error: "Use letters or numbers in the name." };
  }

  const supabase = await createClient();

  // Verify the chosen category exists. Categories are managed via the
  // service-categories admin so a stale form could submit a deleted slug.
  const { data: categoryRow } = await supabase
    .from("service_categories")
    .select("slug")
    .eq("slug", parsed.data.category)
    .maybeSingle();
  if (!categoryRow) {
    return { error: "That category no longer exists. Pick another." };
  }

  // Slug uniqueness check
  const { data: existing } = await supabase
    .from("services")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existing) {
    return {
      error: `A service with this name already exists (slug "${slug}"). Use a different name.`,
    };
  }

  const hourlyRatePence = await getHourlyRatePence(supabase);
  const { error } = await supabase.from("services").insert({
    name: parsed.data.name,
    slug,
    category: parsed.data.category,
    description: parsed.data.description,
    duration_hours: parsed.data.durationHours,
    // Cached indicative price — recomputed here and never edited directly.
    starting_price_pence: cachedPricePence(parsed.data.durationHours, hourlyRatePence),
    display_order: parsed.data.displayOrder,
    is_active: parsed.data.isActive,
  });

  if (error) return { error: error.message };

  revalidateServiceSurfaces();
  redirect("/admin/services?flash=service-created");
}

export async function updateService(
  id: string,
  formData: FormData,
): Promise<ServiceActionResult> {
  const parsed = parseForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();

  // Verify the chosen category still exists
  const { data: categoryRow } = await supabase
    .from("service_categories")
    .select("slug")
    .eq("slug", parsed.data.category)
    .maybeSingle();
  if (!categoryRow) {
    return { error: "That category no longer exists. Pick another." };
  }

  // Note: slug is intentionally not updated. Renaming a service keeps its
  // original slug stable so landing-page icon refs (SERVICE_META) and any
  // future slug-based references don't drift.
  const hourlyRatePence = await getHourlyRatePence(supabase);
  const { error } = await supabase
    .from("services")
    .update({
      name: parsed.data.name,
      category: parsed.data.category,
      description: parsed.data.description,
      duration_hours: parsed.data.durationHours,
      starting_price_pence: cachedPricePence(parsed.data.durationHours, hourlyRatePence),
      display_order: parsed.data.displayOrder,
      is_active: parsed.data.isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidateServiceSurfaces();
  redirect("/admin/services?flash=service-updated");
}

export async function setServiceActive(
  id: string,
  isActive: boolean,
): Promise<ServiceActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("services")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidateServiceSurfaces();
}

// Swaps display_order with the immediately-neighbouring service in the chosen
// direction. If there's no neighbour (we're already at the top/bottom), it's
// a no-op. Two sequential updates — not atomic, but fine for one admin at
// admin-scale traffic.
export async function reorderService(
  id: string,
  direction: "up" | "down",
): Promise<ServiceActionResult> {
  const supabase = await createClient();

  const { data: current, error: currentErr } = await supabase
    .from("services")
    .select("id, display_order")
    .eq("id", id)
    .single();
  if (currentErr || !current) return { error: "Service not found." };

  const neighbourQuery = supabase
    .from("services")
    .select("id, display_order");

  const { data: neighbour } =
    direction === "up"
      ? await neighbourQuery
          .lt("display_order", current.display_order)
          .order("display_order", { ascending: false })
          .limit(1)
          .maybeSingle()
      : await neighbourQuery
          .gt("display_order", current.display_order)
          .order("display_order", { ascending: true })
          .limit(1)
          .maybeSingle();

  if (!neighbour) return; // already at the boundary

  const a = await supabase
    .from("services")
    .update({ display_order: neighbour.display_order, updated_at: new Date().toISOString() })
    .eq("id", current.id);
  if (a.error) return { error: a.error.message };

  const b = await supabase
    .from("services")
    .update({ display_order: current.display_order, updated_at: new Date().toISOString() })
    .eq("id", neighbour.id);
  if (b.error) return { error: b.error.message };

  revalidateServiceSurfaces();
}
