"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { FUEL_FAMILIES, productId, type FuelFamily, type ProductCategory } from "@/lib/catalogue/products";
import { servicePartTypes } from "@/lib/catalogue/service-parts";

// The admin's fixed-price products (Task 31): diagnostics, servicing and
// pre-purchase inspections beside the HaynesPro repair tree. Every write goes
// through the service-role client after an admin check; the customer
// catalogue (lib/haynespro/catalogue.ts) reads the table on every request, and
// the homepage's services section (Task 46) is revalidated below, so a change
// is live at once in both.

export type ProductResult = { ok: true } | { ok: false; error: string };
export type ProductCreateResult = { ok: true; id: string } | { ok: false; error: string };

const CATEGORIES: readonly ProductCategory[] = ["diagnostics", "servicing", "inspection"];
const MAX_NAME = 80;
const MAX_SUMMARY = 160;
const MAX_DESCRIPTION = 2000;
const MAX_INFO_SHEET = 8000;

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
  /** The checklist the mechanic fills in on this product (Task 32), and its tier for an inspection. */
  checklistId?: string | null;
  checklistTier?: string | null;
  /** Task 74: the fuels it's offered for; empty or omitted = every vehicle. */
  fuelTypes?: string[] | null;
  /** Task 74: what the customer reads before booking it. */
  infoSheet?: string | null;
  /** Task 83: the NAPA part types it buys for the car (lib/catalogue/service-parts.ts); empty = none. */
  partGenartIds?: number[] | null;
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
  checklist_id: string | null;
  checklist_tier: string | null;
  fuel_types: FuelFamily[] | null;
  info_sheet: string | null;
  part_genart_ids: number[] | null;
};

const TIERS = ["bronze", "silver", "gold"];

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

  const checklist_id = (input.checklistId ?? "").trim() || null;
  const tierRaw = (input.checklistTier ?? "").trim().toLowerCase();
  const checklist_tier = checklist_id && TIERS.includes(tierRaw) ? tierRaw : null;

  const fuels = FUEL_FAMILIES.filter((f) => (input.fuelTypes ?? []).includes(f));
  const info_sheet = (input.infoSheet ?? "").trim() || null;
  if (info_sheet && info_sheet.length > MAX_INFO_SHEET) return { ok: false, error: "That info sheet is too long." };
  const partIds = servicePartTypes(input.partGenartIds).map((t) => t.genartId);

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
      checklist_id,
      checklist_tier,
      fuel_types: fuels.length > 0 ? fuels : null,
      info_sheet,
      part_genart_ids: partIds.length > 0 ? partIds : null,
    },
  };
}

/**
 * Write a product, coping with a database that predates 0088 (Task 74: fuels
 * and info sheets) or 0091 (Task 83: NAPA parts). A missing column left at its
 * default is dropped and the write goes ahead without it; one that's set
 * tells the admin which migration it needs.
 */
async function writeWithoutMissingColumns<T>(
  row: Cleaned,
  write: (values: Partial<Cleaned>) => PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>,
): Promise<{ data: T | null; error: { code?: string; message: string } | null }> {
  let values: Partial<Cleaned> = row;
  for (;;) {
    const result = await write(values);
    const message = result.error?.message ?? "";
    if (/part_genart_ids/.test(message) && "part_genart_ids" in values) {
      if (values.part_genart_ids != null) {
        return { data: null, error: { message: "NAPA parts can't be saved until migration 0091 is applied." } };
      }
      const { part_genart_ids: _parts, ...rest } = values;
      void _parts;
      values = rest;
      continue;
    }
    if (/fuel_types|info_sheet/.test(message) && ("fuel_types" in values || "info_sheet" in values)) {
      if (values.fuel_types != null || values.info_sheet != null) {
        return { data: null, error: { message: "Fuels and info sheets can't be saved until migration 0088 is applied." } };
      }
      const { fuel_types: _fuels, info_sheet: _sheet, ...rest } = values;
      void _fuels;
      void _sheet;
      values = rest;
      continue;
    }
    return result;
  }
}

function revalidate() {
  revalidatePath("/admin/services");
  revalidatePath("/book/repairs");
  // The homepage lists the active products (repairs-preview.tsx).
  revalidatePath("/");
}

function duplicateMessage(error: { code?: string; message: string }): string {
  return error.code === "23505"
    ? "There's already a product with that name in this category for the same vehicles."
    : error.message;
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
  const displayOrder = (last?.display_order ?? -1) + 1;
  const { data, error } = await writeWithoutMissingColumns<{ id: string }>(cleaned.row, (values) =>
    admin
      .from("catalogue_products")
      .insert({ ...values, display_order: displayOrder })
      .select("id")
      .single(),
  );
  if (error || !data) return { ok: false, error: error ? duplicateMessage(error) : "Couldn't create the product." };
  revalidate();
  return { ok: true, id: data.id };
}

export async function updateProduct(id: string, input: ProductInput): Promise<ProductResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const cleaned = clean(input);
  if (!cleaned.ok) return cleaned;

  const admin = createAdminClient();
  const { error } = await writeWithoutMissingColumns(cleaned.row, (values) =>
    admin
      .from("catalogue_products")
      .update({ ...values, updated_at: new Date().toISOString() })
      .eq("id", id),
  );
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
    return { ok: false, error: "Bookings reference this product. Switch it off instead of deleting it." };
  const { error } = await admin.from("catalogue_products").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidate();
  return { ok: true };
}
