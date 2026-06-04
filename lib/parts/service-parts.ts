import type { SupabaseClient } from "@supabase/supabase-js";

// Shared loader for the parts a service is configured to require. Used by the
// pricing engine (to sum the parts cost) and by booking creation (to snapshot
// the line items). Takes a Supabase client so the caller controls auth —
// callers pass the service-role client because `parts`/`service_parts` are
// admin-only under RLS.

export interface ConfiguredPart {
  partId: string;
  name: string;
  quantity: number;
  /** BMT (sale) price per unit — the only price ever shown to mechanic/customer. */
  unitPricePence: number;
  /** Platform-only: supplier cost per unit. Never surface to a mechanic. */
  supplierCostPence: number;
  /** unitPricePence × quantity. */
  totalPence: number;
}

// A nested PostgREST relation can come back as an object (to-one) or, depending
// on inference, an array — normalise both.
function firstRelation<T>(rel: T | T[] | null | undefined): T | null {
  if (rel == null) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

export async function getConfiguredParts(
  serviceId: string,
  db: SupabaseClient,
): Promise<ConfiguredPart[]> {
  const { data } = await db
    .from("service_parts")
    .select(
      "quantity, part:parts(id, name, bmt_price_pence, supplier_cost_pence, is_active)",
    )
    .eq("service_id", serviceId);

  const rows = data ?? [];
  const out: ConfiguredPart[] = [];
  for (const row of rows as Array<{
    quantity: number;
    part:
      | {
          id: string;
          name: string;
          bmt_price_pence: number;
          supplier_cost_pence: number;
          is_active: boolean;
        }
      | Array<{
          id: string;
          name: string;
          bmt_price_pence: number;
          supplier_cost_pence: number;
          is_active: boolean;
        }>;
  }>) {
    const part = firstRelation(row.part);
    if (!part || part.is_active === false) continue;
    const quantity = Math.max(1, Math.round(row.quantity || 1));
    const unitPricePence = Math.max(0, Math.round(part.bmt_price_pence || 0));
    out.push({
      partId: part.id,
      name: part.name,
      quantity,
      unitPricePence,
      supplierCostPence: Math.max(0, Math.round(part.supplier_cost_pence || 0)),
      totalPence: unitPricePence * quantity,
    });
  }
  return out;
}

/** Sum the BMT price of a service's configured parts (0 if none). */
export async function configuredPartsTotalPence(
  serviceId: string,
  db: SupabaseClient,
): Promise<number> {
  const parts = await getConfiguredParts(serviceId, db);
  return parts.reduce((sum, p) => sum + p.totalPence, 0);
}
