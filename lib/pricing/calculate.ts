// Pricing engine — the single source of truth for what a booking costs.
//
// Labour is derived from DURATION, not a fixed price (Task 15): the service's
// duration in hours × a single global hourly rate. Duration can be overridden
// per (service, area) so the same job costs differently in different postcodes.
// Parts and a commission rate sit on top. The full breakdown is snapshotted
// onto the booking row at creation time so later pricing changes never apply
// retroactively (Task 08 Stage 2 requirement).
//
//   service_amount = duration_hours × hourly_rate_pence   (override wins if set)
//   total          = service_amount + parts
//   fee            = round(total × rate)
//   payout         = total − fee   (transferred to the mechanic in Stage 3)
//
// Two layers:
//   - computePrice(inputs)      — PURE maths, unit-tested (no DB, no I/O).
//   - resolveArea(postcode, …)  — PURE longest-prefix postcode → area match.
//   - calculatePrice(serviceId, postcode, client?) — async DB wrapper that
//                                 loads the inputs and calls computePrice.
//
// Commission model (Task 08 spec, owner decision 2026-06-04): commission is
// charged on the WHOLE total (base + parts), not labour only, and is taken OUT
// of the total (the customer pays the total; the platform keeps its cut).
//
// The area labour_multiplier is retired (Task 15): areas are resolved only to
// pick a per-area duration override. Surge pricing is NOT part of this platform.
//
// NB: the service-role client is imported dynamically inside the async helpers
// (not at module top) so the pure functions above stay importable in unit tests
// without pulling in "server-only".

import type { SupabaseClient } from "@supabase/supabase-js";

/** Fallback commission rate when no per-cell or platform setting is available. */
export const DEFAULT_TAKE_RATE = 0.15;

/** Fallback global hourly rate (pence) when platform_settings has no value. */
export const DEFAULT_HOURLY_RATE_PENCE = 6000;

export interface PriceBreakdown {
  /** Resolved area id (null when no area row matched and no Default exists). */
  areaId: string | null;
  /** Labour-portion base in pence: override, or duration × hourly rate. */
  basePence: number;
  /** Service duration used for this booking, in hours. */
  durationHours: number;
  /** Global hourly rate applied, in pence. */
  hourlyRatePence: number;
  /** Parts cost for this service (0 if none). */
  partsPence: number;
  /** What the customer pays: base + parts. */
  totalPence: number;
  /** Commission rate applied, e.g. 0.15. */
  commissionRate: number;
  /** Platform commission in pence: round(total × rate). */
  platformFeePence: number;
  /** What the mechanic receives: total − platform fee. */
  mechanicPayoutPence: number;
  /**
   * Where the duration came from (Task 16): 'vehicle' = HaynesPro OEM time for
   * the actual car (billed hours after rounding), 'area' = per-(service,area)
   * override, 'service' = service default, 'legacy' = price ÷ rate fallback.
   * Set by calculatePrice; absent when computePrice is called directly.
   */
  durationSource?: DurationSource;
  /** Raw (unrounded) HaynesPro hours when durationSource is 'vehicle'. */
  vehicleRawDurationHours?: number | null;
}

export type DurationSource = "vehicle" | "area" | "service" | "legacy";

export interface ComputePriceInputs {
  durationHours: number;
  hourlyRatePence: number;
  /** If set, overrides duration × hourly rate as the labour base. */
  overridePricePence?: number | null;
  partsPence?: number | null;
  commissionRate: number;
  areaId?: string | null;
}

/**
 * Pure pricing maths. Everything is integer pence; duration and rate are the
 * only fractional inputs. No DB access — fully unit-testable.
 */
export function computePrice(inputs: ComputePriceInputs): PriceBreakdown {
  const durationHours =
    Number.isFinite(inputs.durationHours) && inputs.durationHours > 0
      ? inputs.durationHours
      : 0;
  const hourlyRatePence =
    Number.isFinite(inputs.hourlyRatePence) && inputs.hourlyRatePence > 0
      ? Math.round(inputs.hourlyRatePence)
      : 0;
  const partsPence = Math.max(0, Math.round(inputs.partsPence || 0));
  const rate = Number.isFinite(inputs.commissionRate)
    ? inputs.commissionRate
    : DEFAULT_TAKE_RATE;

  const hasOverride =
    inputs.overridePricePence != null && inputs.overridePricePence >= 0;
  const basePence = hasOverride
    ? Math.round(inputs.overridePricePence as number)
    : Math.round(durationHours * hourlyRatePence);

  const totalPence = basePence + partsPence;
  const platformFeePence = Math.round(totalPence * rate);
  const mechanicPayoutPence = totalPence - platformFeePence;

  return {
    areaId: inputs.areaId ?? null,
    basePence,
    durationHours,
    hourlyRatePence,
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
 * When `vehicle.reg` is supplied (Task 16), the duration ladder tries the
 * HaynesPro OEM book time for that exact vehicle first — rounded UP to whole
 * billable hours (min 1h, owner decision 2026-07-09) — before falling back to
 * the per-area override and the service default. The HaynesPro lookup is
 * cached per reg in Supabase, so match → slot → create-booking all price
 * identically, and any HaynesPro failure silently falls through the ladder.
 *
 * Throws if the service doesn't exist — callers in the booking flow already
 * guard on a valid service before reaching payment.
 */
export async function calculatePrice(
  serviceId: string,
  postcode: string,
  client?: DbClient,
  vehicle?: { reg?: string | null },
): Promise<PriceBreakdown> {
  const db = client ?? (await import("@/lib/supabase/admin")).createAdminClient();

  const { data: service, error: serviceError } = await db
    .from("services")
    .select("id, duration_hours, starting_price_pence, commission_rate")
    .eq("id", serviceId)
    .single();
  if (serviceError || !service) {
    throw new Error("Service not found for pricing.");
  }

  const hourlyRatePence = await getHourlyRatePence(db);

  const { data: areas } = await db
    .from("areas")
    .select("id, name, postcode_prefixes, labour_multiplier")
    .eq("is_active", true);

  const area = resolveArea(postcode, (areas ?? []) as AreaRow[]);

  let sap: {
    override_price_pence: number | null;
    parts_price_pence: number | null;
    commission_rate: number | null;
    duration_hours: number | null;
  } | null = null;
  if (area) {
    const { data } = await db
      .from("service_area_prices")
      .select("override_price_pence, parts_price_pence, commission_rate, duration_hours")
      .eq("service_id", serviceId)
      .eq("area_id", area.id)
      .eq("is_active", true)
      .maybeSingle();
    sap = data ?? null;
  }

  // Duration resolution, most-specific wins: HaynesPro vehicle-specific time →
  // per-(service,area) override → service default. Legacy fallback: if a
  // service predates durations, derive one from its cached price so pricing
  // never divides by a null.
  //
  // The vehicle rung (Task 16) fires only when a reg is supplied and the
  // HaynesPro env is configured: the raw OEM book time is rounded UP to whole
  // billable hours (min 1h — billableHours). Raw hours are cached per
  // (reg, service) on the Supabase vehicle row, so match → slot →
  // create-booking price identically; any lookup failure returns null and the
  // ladder falls through — the funnel never blocks on HaynesPro.
  let vehicleBilledHours: number | null = null;
  let vehicleRawHours: number | null = null;
  const reg = vehicle?.reg?.trim();
  if (reg) {
    const { isHaynesProConfigured } = await import("@/lib/haynespro/client");
    if (isHaynesProConfigured()) {
      const { vehicleRawDurationHours } = await import("@/lib/haynespro/durations");
      const { billableHours } = await import("@/lib/pricing/billable");
      vehicleRawHours = await vehicleRawDurationHours(serviceId, reg, db);
      vehicleBilledHours = billableHours(vehicleRawHours);
    }
  }

  const serviceDuration = numberOrNull(
    (service as { duration_hours: number | null }).duration_hours,
  );
  const areaDuration = numberOrNull(sap?.duration_hours ?? null);
  const durationHours =
    vehicleBilledHours ??
    areaDuration ??
    serviceDuration ??
    (hourlyRatePence > 0 ? service.starting_price_pence / hourlyRatePence : 0);
  const durationSource: DurationSource =
    vehicleBilledHours != null
      ? "vehicle"
      : areaDuration != null
        ? "area"
        : serviceDuration != null
          ? "service"
          : "legacy";

  // Commission resolution, most-specific wins:
  //   per-(service,area) cell override → per-service rate → platform default.
  const serviceRate = (service as { commission_rate: number | null }).commission_rate;
  const commissionRate =
    sap?.commission_rate ?? serviceRate ?? (await getTakeRateBase(db));

  // Parts cost: real admin-configured parts (Task 10 Stage 2) supersede the
  // legacy per-(service,area) dummy `parts_price_pence`. Fall back to the dummy
  // only when a service has no configured parts, so pre-parts behaviour holds.
  const { configuredPartsTotalPence } = await import("@/lib/parts/service-parts");
  const configuredParts = await configuredPartsTotalPence(serviceId, db);
  const partsPence = configuredParts > 0 ? configuredParts : (sap?.parts_price_pence ?? 0);

  return {
    ...computePrice({
      durationHours,
      hourlyRatePence,
      overridePricePence: sap?.override_price_pence ?? null,
      partsPence,
      commissionRate,
      areaId: area?.id ?? null,
    }),
    durationSource,
    vehicleRawDurationHours: durationSource === "vehicle" ? vehicleRawHours : null,
  };
}

/** Coerce a Postgres numeric (number or numeric-string) to a number, or null. */
function numberOrNull(raw: unknown): number | null {
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
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

/**
 * Read the global hourly labour rate (pence) from platform_settings. Defensively
 * returns DEFAULT_HOURLY_RATE_PENCE if the key doesn't exist yet (seeded in
 * migration 0033) so the engine works before the admin control lands.
 */
export async function getHourlyRatePence(client?: DbClient): Promise<number> {
  const db = client ?? (await import("@/lib/supabase/admin")).createAdminClient();
  try {
    const { data } = await db
      .from("platform_settings")
      .select("value")
      .eq("key", "hourly_rate_pence")
      .maybeSingle();
    const raw = data?.value;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.round(n) : DEFAULT_HOURLY_RATE_PENCE;
  } catch {
    return DEFAULT_HOURLY_RATE_PENCE;
  }
}
