// Pricing engine — the single source of truth for what a booking costs.
//
// Labour is derived from DURATION: the repair's billed hours (HaynesPro OEM
// book time, rounded up to whole hours, min 1h — see lib/pricing/billable.ts)
// × a single global hourly rate. The full breakdown is snapshotted onto the
// booking row at creation time so later pricing changes never apply
// retroactively (Task 08 Stage 2 requirement). Quoting from a (reg, repair
// node) lives in lib/haynespro/repair-booking.ts, which calls computePrice.
//
//   labour = billed_hours × hourly_rate_pence
//   total  = labour + parts (repairs carry no parts line today)
//   fee    = round(total × rate)
//   payout = total − fee   (transferred to the mechanic on completion)
//
// Layers:
//   - computePrice(inputs)      — PURE maths, unit-tested (no DB, no I/O).
//   - resolveArea(postcode, …)  — PURE longest-prefix postcode → area match
//                                 (coverage/dispatch, not pricing).
//
// Commission model (Task 08 spec, owner decision 2026-06-04): commission is
// charged on the WHOLE total (base + parts), not labour only, and is taken OUT
// of the total (the customer pays the total; the platform keeps its cut).
//
// The area labour_multiplier is retired (Task 15). The per-service catalogue
// and its per-(service,area) overrides are gone entirely (Task 17): every
// booking is a HaynesPro repair priced from the OEM book time.
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
   * Where the duration came from. Every new booking is 'vehicle' (HaynesPro
   * OEM time for the actual car, billed hours after rounding); the other
   * values survive only on historical rows from the packaged-services era.
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
