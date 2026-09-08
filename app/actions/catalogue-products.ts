"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { productId, type ProductCategory } from "@/lib/catalogue/products";

// The admin's fixed-price products (Task 31): diagnostics, servicing and
// pre-purchase inspections beside the HaynesPro repair tree. Every write goes
// through the service-role client after an admin check; the customer
// catalogue (lib/haynespro/catalogue.ts) reads the table on every request, so
// a change is live at once.

export type ProductResult = { ok: true } | { ok: false; error: string };
export type ProductCreateResult = { ok: true; id: string } | { ok: false; error: string };

const CATEGORIES: readonly ProductCategory[] = ["diagnostics", "servicing", "inspection"];
const MAX_NAME = 80;
const MAX_SUMMARY = 160;
const MAX_DESCRIPTION = 2000;

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { ok: false, error: "Admins only." };
  return { ok: true };
}

export interface ProductInput {
  category: string;
  name: string;
  summary?: string | null;
  description?: string | null;
  /** "fixed" → pricePence; "hourly" → labourHours. */
  pricing: "fixed" | "hourly";
  pricePence?: number | null;
  labourHours?: number | null;
  durationHours: number;
  includesEngineOil: boolean;
  isActive: boolean;
}

type Cleaned = {
  category: ProductCategory;
  name: string;
  summary: string | null;
  description: string | null;
  price_pence: number | null;
  labour_hours: number | null;
  duration_hours: number;
  includes_engine_oil: boolean;
  is_active: boolean;
};

function clean(input: ProductInput): { ok: true; row: Cleaned } | { ok: false; error: string } {
  if (!CATEGORIES.includes(input.category as ProductCategory))
    return { ok: false, error: "Choose a category." };
  const name = (input.name ?? "").trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Give the product a name." };
  if (name.length > MAX_NAME) return { ok: false, error: `Keep the name under ${MAX_NAME} characters.` };
  const summary = (input.summary ?? "").trim() || null;
  if (summary && summary.length > MAX_SUMMARY) return { ok: false, error: `Keep the summary under ${MAX_SUMMARY} characters.` };
  const description = (input.description ?? "").trim() || null;
  if (description && description.length > MAX_DESCRIPTION) return { ok: false, error: "That description is too long." };

  let price_pence: number | null = null;
  let labour_hours: number | null = null;
  if (input.pricing === "fixed") {
    const p = Math.round(Number(input.pricePence));
    if (!Number.isFinite(p) || p < 0) return { ok: false, error: "Enter a price of £0 or more." };
    price_pence = p;
  } else {
    const h = Number(input.labourHours);
    if (!Number.isFinite(h) || h <= 0 || h > 24) return { ok: false, error: "Enter the labour hours (more than 0, up to 24)." };
    labour_hours = Math.round(h * 100) / 100;
  }
  const d = Number(input.durationHours);
  if (!Number.isFinite(d) || d <= 0 || d > 24) return { ok: false, error: "Enter how long the visit takes (more than 0, up to 24 hours)." };

  return {
    ok: true,
    row: {
      category: input.category as ProductCategory,
      name,
      summary,
      description,
      price_pence,
      labour_hours,
      duration_hours: Math.round(d * 100) / 100,
      includes_engine_oil: Boolean(input.includesEngineOil),
      is_active: Boolean(input.isActive),
    },
  };
}

function revalidate() {
  revalidatePath("/admin/services");
  revalidatePath("/book/repairs");
}

function duplicateMessage(error: { code?: string; message: string }): string {
  return error.code === "23505" ? "There's already a product with that name in this category." : error.message;
}

export async function createProduct(input: ProductInput): Promise<ProductCreateResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const cleaned = clean(input);
  if (!cleaned.ok) return cleaned;

  const admin = createAdminClient();
  // Append to the end of its category.
  const { data: last } = await admin
    .from("catalogue_products")
    .select("display_order")
    .eq("category", cleaned.row.category)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await admin
    .from("catalogue_products")
    .insert({ ...cleaned.row, display_order: (last?.display_order ?? -1) + 1 })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error ? duplicateMessage(error) : "Couldn't create the product." };
  revalidate();
  return { ok: true, id: data.id };
}

export async function updateProduct(id: string, input: ProductInput): Promise<ProductResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const cleaned = clean(input);
  if (!cleaned.ok) return cleaned;

  const { error } = await createAdminClient()
    .from("catalogue_products")
    .update({ ...cleaned.row, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: duplicateMessage(error) };
  revalidate();
  return { ok: true };
}

export async function setProductActive(id: string, isActive: boolean): Promise<ProductResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const { error } = await createAdminClient()
    .from("catalogue_products")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}

/** Swap display_order with the neighbour above or below, within the category. */
export async function reorderProduct(id: string, direction: "up" | "down"): Promise<ProductResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const admin = createAdminClient();
  const { data: me } = await admin.from("catalogue_products").select("id, category, display_order").eq("id", id).maybeSingle();
  if (!me) return { ok: false, error: "That product no longer exists." };
  const { data: siblings } = await admin
    .from("catalogue_products")
    .select("id, display_order")
    .eq("category", me.category)
    .order("display_order", { ascending: true });
  const list = siblings ?? [];
  const index = list.findIndex((s) => s.id === id);
  const other = direction === "up" ? list[index - 1] : list[index + 1];
  if (!other) return { ok: true };
  // Positions may collide after seeding; renumber the whole category so a
  // swap is always a swap.
  const renumbered = list.map((s, i) => ({ id: s.id, order: i }));
  const a = renumbered.find((s) => s.id === id)!;
  const b = renumbered.find((s) => s.id === other.id)!;
  [a.order, b.order] = [b.order, a.order];
  for (const s of renumbered) {
    const { error } = await admin.from("catalogue_products").update({ display_order: s.order }).eq("id", s.id);
    if (error) return { ok: false, error: error.message };
  }
  revalidate();
  return { ok: true };
}

/** Hard delete — refused while any booking references the product; switch it off instead. */
export async function deleteProduct(id: string): Promise<ProductResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const admin = createAdminClient();
  const nodeId = productId(id);
  const [{ count: bookings }, { count: lines }] = await Promise.all([
    admin.from("bookings").select("id", { count: "exact", head: true }).eq("repair_node_id", nodeId),
    admin.from("booking_repairs").select("id", { count: "exact", head: true }).eq("node_id", nodeId),
  ]);
  if ((bookings ?? 0) > 0 || (lines ?? 0) > 0)
    return { ok: false, error: "Bookings reference this product — switch it off instead of deleting it." };
  const { error } = await admin.from("catalogue_products").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}
