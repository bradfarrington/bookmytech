"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parsePrice, slugify } from "@/lib/utils";

// Admin parts-catalogue actions (Task 10 Stage 2). All run under the admin
// session and rely on the admin-only RLS on `parts` / `service_parts`.

export type PartActionResult = { error?: string } | void;

interface ParsedPart {
  name: string;
  sku: string;
  category: string;
  supplier: string | null;
  description: string | null;
  supplierCostPence: number;
  bmtPricePence: number;
  inStock: boolean;
}

function parsePartForm(
  formData: FormData,
): { ok: true; data: ParsedPart } | { ok: false; error: string } {
  const name = String(formData.get("name") ?? "").trim();
  const skuRaw = String(formData.get("sku") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const supplier = String(formData.get("supplier") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim() || null;
  const supplierCostPence = parsePrice(String(formData.get("supplier_cost") ?? ""));
  const bmtPricePence = parsePrice(String(formData.get("bmt_price") ?? ""));
  const inStock = formData.get("in_stock") === "on";

  if (!name) return { ok: false, error: "Name is required." };
  if (!category) return { ok: false, error: "Category is required." };
  if (supplierCostPence === null || supplierCostPence < 0) {
    return { ok: false, error: "Enter a valid supplier cost." };
  }
  if (bmtPricePence === null || bmtPricePence < 0) {
    return { ok: false, error: "Enter a valid BMT price." };
  }
  // SKU defaults to an uppercased slug of the name so it's always set + unique-ish.
  const sku = (skuRaw || slugify(name)).toUpperCase();
  if (!sku) return { ok: false, error: "Couldn't derive a SKU — add one manually." };

  return {
    ok: true,
    data: {
      name,
      sku,
      category: category.toLowerCase().replace(/\s+/g, "_"),
      supplier,
      description,
      supplierCostPence,
      bmtPricePence,
      inStock,
    },
  };
}

function revalidatePartsSurfaces() {
  revalidatePath("/admin/parts");
}

export async function createPart(formData: FormData): Promise<PartActionResult> {
  const parsed = parsePartForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("parts")
    .select("id")
    .eq("sku", parsed.data.sku)
    .maybeSingle();
  if (existing) {
    return { error: `A part with SKU "${parsed.data.sku}" already exists.` };
  }

  const { error } = await supabase.from("parts").insert({
    name: parsed.data.name,
    sku: parsed.data.sku,
    category: parsed.data.category,
    supplier: parsed.data.supplier,
    description: parsed.data.description,
    supplier_cost_pence: parsed.data.supplierCostPence,
    bmt_price_pence: parsed.data.bmtPricePence,
    in_stock: parsed.data.inStock,
  });
  if (error) return { error: error.message };

  revalidatePartsSurfaces();
  redirect("/admin/parts?flash=part-created");
}

export async function updatePart(
  id: string,
  formData: FormData,
): Promise<PartActionResult> {
  const parsed = parsePartForm(formData);
  if (!parsed.ok) return { error: parsed.error };

  const supabase = await createClient();
  // SKU uniqueness excluding self.
  const { data: clash } = await supabase
    .from("parts")
    .select("id")
    .eq("sku", parsed.data.sku)
    .neq("id", id)
    .maybeSingle();
  if (clash) return { error: `Another part already uses SKU "${parsed.data.sku}".` };

  const { error } = await supabase
    .from("parts")
    .update({
      name: parsed.data.name,
      sku: parsed.data.sku,
      category: parsed.data.category,
      supplier: parsed.data.supplier,
      description: parsed.data.description,
      supplier_cost_pence: parsed.data.supplierCostPence,
      bmt_price_pence: parsed.data.bmtPricePence,
      in_stock: parsed.data.inStock,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePartsSurfaces();
  redirect("/admin/parts?flash=part-updated");
}

export async function setPartStock(id: string, inStock: boolean): Promise<PartActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts")
    .update({ in_stock: inStock, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePartsSurfaces();
}

export async function setPartActive(id: string, isActive: boolean): Promise<PartActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("parts")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePartsSurfaces();
}

export async function deletePart(id: string): Promise<PartActionResult> {
  const supabase = await createClient();
  // Block deletion if any booking already snapshotted this part — keep history
  // intact. Suggest deactivating instead.
  const { count } = await supabase
    .from("booking_parts")
    .select("id", { count: "exact", head: true })
    .eq("part_id", id);
  if ((count ?? 0) > 0) {
    return {
      error: `This part is on ${count} booking${count === 1 ? "" : "s"}. Deactivate it instead of deleting.`,
    };
  }
  const { error } = await supabase.from("parts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePartsSurfaces();
}

// --- CSV import ------------------------------------------------------------

export interface CsvImportResult {
  ok: boolean;
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
}

/**
 * Bulk import/update parts from a pasted CSV (supplier price lists). Header row
 * required; recognised columns: name, sku, category, supplier, supplier_cost,
 * bmt_price, description. Rows upsert on SKU. Prices accept "£18.00" or "1800"
 * (pence). Returns a per-row summary rather than throwing on the first bad row.
 */
export async function importPartsCsv(csvText: string): Promise<CsvImportResult> {
  const result: CsvImportResult = { ok: false, inserted: 0, updated: 0, skipped: 0, errors: [] };
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    result.errors.push("CSV needs a header row and at least one data row.");
    return result;
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iName = col("name");
  const iSku = col("sku");
  const iCat = col("category");
  if (iName === -1 || iCat === -1) {
    result.errors.push("CSV must include at least 'name' and 'category' columns.");
    return result;
  }
  const iSupplier = col("supplier");
  const iCost = col("supplier_cost");
  const iPrice = col("bmt_price");
  const iDesc = col("description");

  const supabase = await createClient();

  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    if (cells.length === 1 && cells[0].trim() === "") continue; // blank line
    const name = (cells[iName] ?? "").trim();
    if (!name) {
      result.skipped++;
      continue;
    }
    const category = (cells[iCat] ?? "").trim().toLowerCase().replace(/\s+/g, "_");
    const sku = ((iSku !== -1 ? cells[iSku] : "") || slugify(name)).trim().toUpperCase();
    const supplierCost = iCost !== -1 ? parsePrice(cells[iCost] ?? "") : 0;
    const bmtPrice = iPrice !== -1 ? parsePrice(cells[iPrice] ?? "") : null;
    if (bmtPrice === null) {
      result.errors.push(`Row ${r + 1} (${name}): missing/invalid bmt_price.`);
      result.skipped++;
      continue;
    }

    const payload = {
      name,
      sku,
      category: category || "misc",
      supplier: iSupplier !== -1 ? (cells[iSupplier] ?? "").trim() || null : null,
      description: iDesc !== -1 ? (cells[iDesc] ?? "").trim() || null : null,
      supplier_cost_pence: supplierCost ?? 0,
      bmt_price_pence: bmtPrice,
      updated_at: new Date().toISOString(),
    };

    const { data: existing } = await supabase
      .from("parts")
      .select("id")
      .eq("sku", sku)
      .maybeSingle();

    if (existing) {
      const { error } = await supabase.from("parts").update(payload).eq("id", existing.id);
      if (error) {
        result.errors.push(`Row ${r + 1} (${name}): ${error.message}`);
        result.skipped++;
      } else {
        result.updated++;
      }
    } else {
      const { error } = await supabase.from("parts").insert(payload);
      if (error) {
        result.errors.push(`Row ${r + 1} (${name}): ${error.message}`);
        result.skipped++;
      } else {
        result.inserted++;
      }
    }
  }

  result.ok = result.inserted + result.updated > 0;
  if (result.ok) revalidatePartsSurfaces();
  return result;
}

/** Minimal CSV parser: handles quoted fields, escaped quotes ("") and commas. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const s = text.replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // flush last field/row
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// --- Service ↔ parts configuration -----------------------------------------

export async function attachServicePart(
  serviceId: string,
  partId: string,
  quantity: number,
): Promise<PartActionResult> {
  if (!serviceId || !partId) return { error: "Pick a part to add." };
  const qty = Math.max(1, Math.round(quantity || 1));
  const supabase = await createClient();
  const { error } = await supabase
    .from("service_parts")
    .insert({ service_id: serviceId, part_id: partId, quantity: qty });
  if (error) {
    if (error.code === "23505") return { error: "That part is already on this service." };
    return { error: error.message };
  }
  revalidatePath(`/admin/services/${serviceId}/edit`);
}

export async function setServicePartQuantity(
  id: string,
  serviceId: string,
  quantity: number,
): Promise<PartActionResult> {
  const qty = Math.max(1, Math.round(quantity || 1));
  const supabase = await createClient();
  const { error } = await supabase
    .from("service_parts")
    .update({ quantity: qty })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/services/${serviceId}/edit`);
}

export async function detachServicePart(
  id: string,
  serviceId: string,
): Promise<PartActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("service_parts").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath(`/admin/services/${serviceId}/edit`);
}
