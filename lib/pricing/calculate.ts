// Pricing engine — the single source of truth for what a booking costs.
//
// Replaces "services.starting_price_pence as the booking total" with a total
// that accounts for an area labour multiplier, an optional per-(service,area)
// price override + dummy parts cost, and a commission rate. The full breakdown
// is snapshotted onto the booking row at creation time so later pricing changes
// never apply retroactively (Task 08 Stage 2 requirement).
//
// Two layers:
//   - computePrice(inputs)      — PURE maths, unit-tested (no DB, no I/O).
//   - resolveArea(postcode, …)  — PURE longest-prefix postcode → area match.
//   - calculatePrice(serviceId, postcode, client?) — async DB wrapper that
//                                 loads the inputs and calls computePrice.
//
// Commission model (Task 08 spec, owner decision 2026-06-04): commission is
// charged on the WHOLE total (base + parts), not labour only. So:
//   total   = base + parts
//   fee     = round(total × rate)
//   payout  = total − fee   (transferred to the mechanic in Stage 3)
//
// Surge pricing is NOT part of this platform — there is no surge input or hook.
//
// NB: the service-role client is imported dynamically inside the async helpers
// (not at module top) so the pure functions above stay importable in unit tests
// without pulling in "server-only".

import type { SupabaseClient } from "@supabase/supabase-js";

/** Fallback commission rate when no per-cell or platform setting is available. */
export const DEFAULT_TAKE_RATE = 0.15;

export interface PriceBreakdown {
  /** Resolved area id (null when no area row matched and no Default exists). */
  areaId: string | null;
  /** Labour-portion base in pence: override, or starting × multiplier. */
  basePence: number;
  /** Area labour multiplier applied (1.000 = no change). */
  labourMultiplier: number;
  /** Dummy parts cost for this service/area (0 if none). */
  partsPence: number;
  /** What the customer pays: base + parts. */
  totalPence: number;
  /** Commission rate applied, e.g. 0.15. */
  commissionRate: number;
  /** Platform commission in pence: round(total × rate). */
  platformFeePence: number;
  /** What the mechanic receives: total − platform fee. */
  mechanicPayoutPence: number;
}

export interface ComputePriceInputs {
  startingPricePence: number;
  labourMultiplier: number;
  /** If set, overrides startingPrice × multiplier as the base. */
  overridePricePence?: number | null;
  partsPence?: number | null;
  commissionRate: number;
  areaId?: string | null;
}

/**
 * Pure pricing maths. Everything is integer pence; multiplier and rate are the
 * only fractional inputs. No DB access — fully unit-testable.
 */
export function computePrice(inputs: ComputePriceInputs): PriceBreakdown {
  const starting = Math.max(0, Math.round(inputs.startingPricePence || 0));
  const labourMultiplier = Number.isFinite(inputs.labourMultiplier)
    ? inputs.labourMultiplier
    : 1;
  const partsPence = Math.max(0, Math.round(inputs.partsPence || 0));
  const rate = Number.isFinite(inputs.commissionRate)
    ? inputs.commissionRate
    : DEFAULT_TAKE_RATE;

  const hasOverride =
    inputs.overridePricePence != null && inputs.overridePricePence >= 0;
  const basePence = hasOverride
    ? Math.round(inputs.overridePricePence as number)
    : Math.round(starting * labourMultiplier);

  const totalPence = basePence + partsPence;
  const platformFeePence = Math.round(totalPence * rate);
  const mechanicPayoutPence = totalPence - platformFeePence;

  return {
    areaId: inputs.areaId ?? null,
    basePence,
    labourMultiplier,
    partsPence,
    totalPence,
    commissionRate: rate,
    platformFeePence,
    mechanicPayoutPence,
  };
}

export interface AreaRow {
  id: string;
  name: string;
  postcode_prefixes: string[];
  labour_multiplier: number;
}

/** Normalise a postcode for prefix matching: uppercase, strip all whitespace. */
export function normalisePostcode(postcode: string): string {
  return (postcode || "").toUpperCase().replace(/\s+/g, "");
}

/**
 * Resolve a postcode to its area using longest-prefix-wins, so "SW1A 1AA"
 * (prefix "SW1") matches London Z1-Z2 ahead of "SW" → London Z3-Z6. Areas with
 * no prefixes (the "Default" catch-all) never win a prefix match; they're the
 * fallback when nothing else matches. Returns null when no area resolves.
 */
export function resolveArea(postcode: string, areas: AreaRow[]): AreaRow | null {
  const pc = normalisePostcode(postcode);

  let best: AreaRow | null = null;
  let bestLen = -1;
  if (pc) {
    for (const area of areas) {
      for (const prefix of area.postcode_prefixes ?? []) {
        const p = normalisePostcode(prefix);
        if (p && pc.startsWith(p) && p.length > bestLen) {
          best = area;
          bestLen = p.length;
        }
      }
    }
  }
  if (best) return best;

  // Fallback: the explicit catch-all named "Default", else the first
  // prefix-less area, else nothing.
  return (
    areas.find((a) => a.name === "Default") ??
    areas.find((a) => (a.postcode_prefixes ?? []).length === 0) ??
    null
  );
}

type DbClient = SupabaseClient;

/**
 * Load the pricing inputs for (service, postcode) and compute the breakdown.
 * Uses the service-role client by default (pricing reference data is fine to
 * read server-side); pass a client to reuse an existing connection.
 *
 * Throws if the service doesn't exist — callers in the booking flow already
 * guard on a valid service before reaching payment.
 */
export async function calculatePrice(
  serviceId: string,
  postcode: string,
  client?: DbClient,
): Promise<PriceBreakdown> {
  const db = client ?? (await import("@/lib/supabase/admin")).createAdminClient();

  const { data: service, error: serviceError } = await db
    .from("services")
    .select("id, starting_price_pence, commission_rate")
    .eq("id", serviceId)
    .single();
  if (serviceError || !service) {
    throw new Error("Service not found for pricing.");
  }

  const { data: areas } = await db
    .from("areas")
    .select("id, name, postcode_prefixes, labour_multiplier")
    .eq("is_active", true);

  const area = resolveArea(postcode, (areas ?? []) as AreaRow[]);

  let sap: {
    override_price_pence: number | null;
    parts_price_pence: number | null;
    commission_rate: number | null;
  } | null = null;
  if (area) {
    const { data } = await db
      .from("service_area_prices")
      .select("override_price_pence, parts_price_pence, commission_rate")
      .eq("service_id", serviceId)
      .eq("area_id", area.id)
      .eq("is_active", true)
      .maybeSingle();
    sap = data ?? null;
  }

  // Commission resolution, most-specific wins:
  //   per-(service,area) cell override → per-service rate → platform default.
  const serviceRate = (service as { commission_rate: number | null }).commission_rate;
  const commissionRate =
    sap?.commission_rate ?? serviceRate ?? (await getTakeRateBase(db));

  return computePrice({
    startingPricePence: service.starting_price_pence,
    labourMultiplier: area?.labour_multiplier ?? 1,
    overridePricePence: sap?.override_price_pence ?? null,
    partsPence: sap?.parts_price_pence ?? 0,
    commissionRate,
    areaId: area?.id ?? null,
  });
}

/**
 * Read the platform default take rate from platform_settings. Defensively
 * returns DEFAULT_TAKE_RATE if the table/key doesn't exist yet (it's seeded in
 * Stage 2) so the engine works before the admin pricing controls land.
 */
export async function getTakeRateBase(client?: DbClient): Promise<number> {
  const db = client ?? (await import("@/lib/supabase/admin")).createAdminClient();
  try {
    const { data } = await db
      .from("platform_settings")
      .select("value")
      .eq("key", "take_rate_base")
      .maybeSingle();
    const raw = data?.value;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_TAKE_RATE;
  } catch {
    return DEFAULT_TAKE_RATE;
  }
}
