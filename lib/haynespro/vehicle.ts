// Vehicle → HaynesPro car-type resolution with a Supabase-backed cache
// (Task 16).
//
// A UK reg is resolved to a HaynesPro car type (and its repair-times type) so
// the pricing engine can ask "how long does THIS job take on THIS car?".
//
// Resolution paths, best first:
//   1. cache hit in haynespro_vehicle_cache (per normalised reg, ~30-day TTL —
//      HaynesPro car-type ids are NOT stable across their quarterly database
//      updates, so cached ids must expire and re-resolve)
//   2. VIN → decodeVINV4                  (wired, but no VIN source until the
//                                          VRM supplier lands — see Task 16)
//   3. DVLA/DVSA details → findCarTypesByDetailsV3, scored locally on engine
//      capacity / fuel / year
//
// Failures are negative-cached in memory for a few minutes so an unmatchable
// vehicle doesn't re-run the whole resolution on every price calculation in
// the funnel. All failures return null — the pricing ladder falls through.

import type { SupabaseClient } from "@supabase/supabase-js";
import { haynesProCall } from "./client";
import type { HpCarType, HpRepairtimeType } from "./types";

export interface ResolvedVehicle {
  reg: string; // normalised: uppercase, no spaces
  carTypeId: number;
  repairtimeTypeId: number | null;
  description: string | null;
  /** Make (DVLA-sourced, uppercased) — e.g. "VOLKSWAGEN". */
  hpMake: string | null;
  /**
   * Make+model portion of the HaynesPro full type name — e.g.
   * "VOLKSWAGEN Golf IV (1J)". Per-vehicle service exclusions (Stage D) match
   * on this label because HaynesPro NAMES are stable across their quarterly
   * database updates while numeric ids are not.
   */
  hpModelLabel: string | null;
}

/**
 * Derive the make+model label from a candidate's full type name by stripping
 * the type-name suffix: fullName "VOLKSWAGEN Golf IV (1J) 1.4" with name
 * "1.4" → "VOLKSWAGEN Golf IV (1J)". Pure — unit-tested.
 */
export function deriveModelLabel(
  fullName: string | null | undefined,
  typeName: string | null | undefined,
): string | null {
  const full = (fullName ?? "").trim();
  if (!full) return null;
  const type = (typeName ?? "").trim();
  if (type && full.toUpperCase().endsWith(type.toUpperCase())) {
    const label = full.slice(0, full.length - type.length).trim();
    return label || full;
  }
  return full;
}

/**
 * DVLA/DVSA model strings carry trim + drivetrain noise ("RANGER WILDTRAK
 * ECOBLUE 4X4 A") that HaynesPro's model text search will never match ("Ranger").
 * Search the full string first, then progressively drop trailing words down to
 * the bare model name, then two derived last resorts (verified against live
 * HaynesPro naming 2026-07-10):
 *
 *   badge → series   "320D M SPORT" → "3"   (HaynesPro: "3 (F30…)")
 *                    "C220 D AMG LINE" → "C" (HaynesPro: "C (W205)")
 *   make-stripped    "MAZDA3 SE-L" → "3"    (HaynesPro: "3 (BM, BN)")
 *
 * Candidate scoring (hard capacity/fuel gates) keeps the shorter, broader
 * searches honest. Pure — unit-tested.
 */
export function buildModelCandidates(model: string, make?: string | null): string[] {
  const words = (model ?? "").trim().toUpperCase().split(/\s+/).filter(Boolean);
  const candidates: string[] = [];
  const push = (c: string) => {
    if (c && !candidates.includes(c)) candidates.push(c);
  };
  for (let n = words.length; n >= 1; n--) {
    push(words.slice(0, n).join(" "));
  }

  const first = words[0] ?? "";

  // "MAZDA3" → "3": strip a leading make prefix off the first word.
  const makeWord = (make ?? "").trim().toUpperCase().split(/\s+/)[0] ?? "";
  if (makeWord.length >= 3 && first.startsWith(makeWord) && first !== makeWord) {
    push(first.slice(makeWord.length));
  }

  // BMW-style badge: 3 digits (+engine letters) → the series digit.
  const bmwStyle = /^(\d)\d{2}[A-Z]{0,3}$/.exec(first);
  if (bmwStyle) push(bmwStyle[1]);

  // Mercedes-style badge: class letters + digits → the class ("C220" → "C",
  // "GLC250" → "GLC").
  const mercStyle = /^([A-Z]{1,3})\d{2,3}[A-Z]{0,4}$/.exec(first);
  if (mercStyle) push(mercStyle[1]);

  return candidates;
}

/** Details we can feed the matcher — a subset of the DVLA/DVSA lookup result. */
export interface VehicleDetailsInput {
  vin?: string | null;
  make?: string | null;
  model?: string | null;
  engineCapacity?: number | null;
  fuelType?: string | null;
  yearOfManufacture?: number | null;
}

const NEGATIVE_CACHE_TTL_MS = 10 * 60 * 1000;
const negativeCache = new Map<string, number>();

/** The `haynespro_vehicle_cache` primary key for a reg: uppercase, no spaces. */
export function cacheRegKey(reg: string): string {
  return (reg || "").toUpperCase().replace(/\s+/g, "");
}

/**
 * Forget that a reg failed to resolve.
 *
 * A reg we couldn't match is negative-cached for ten minutes, and that check
 * runs BEFORE the database read — so a customer who fails to resolve and then
 * corrects the vehicle by hand would keep getting null from this instance for
 * the rest of the window, with their correction sitting in the table unread.
 * The manual-selection path calls this straight after writing the row.
 */
export function clearNegativeCache(reg: string): void {
  negativeCache.delete(cacheRegKey(reg));
}

type DbClient = SupabaseClient;

// ---------------------------------------------------------------------------
// Candidate scoring — pure, unit-testable.
// ---------------------------------------------------------------------------

/**
 * Score a HaynesPro car-type candidate against the DVLA/DVSA details. Higher
 * is better; negative means "reject". Capacity is the strongest signal (DVLA
 * and HaynesPro both report cc), then fuel, then year-in-production-range.
 */
export function scoreCandidate(
  candidate: HpCarType,
  details: VehicleDetailsInput,
): number {
  let score = 0;

  if (details.engineCapacity && candidate.capacity) {
    const diff = Math.abs(candidate.capacity - details.engineCapacity);
    if (diff > 100) return -1; // wrong engine size — never acceptable
    score += diff <= 25 ? 40 : 20;
  }

  if (details.fuelType && candidate.fuelType) {
    const candFuels = (
      Array.isArray(candidate.fuelType) ? candidate.fuelType : [candidate.fuelType]
    ).map((f) => (f || "").toUpperCase());
    const wanted = details.fuelType.toUpperCase();

    // DVLA fuel families: "PETROL" / "DIESEL" / "ELECTRICITY" (pure EV) /
    // "HYBRID ELECTRIC" (petrol hybrid) / "ELECTRIC DIESEL" (diesel hybrid).
    // HaynesPro tags hybrids with their COMBUSTION fuel — a Cayenne E-Hybrid
    // is fuelType PETROL with "Hybrid" only in the type NAME (verified live
    // 2026-07-10) — so electrified vehicles accept the combustion fuel or
    // ELECTRIC, and hybrid-named variants get a preference bump.
    const electrified = wanted.includes("HYBRID") || wanted.includes("ELECTRIC");
    let accepted: string[] | null = null;
    if (wanted.includes("DIESEL")) {
      accepted = electrified ? ["DIESEL", "ELECTRIC"] : ["DIESEL"];
    } else if (wanted.includes("PETROL")) {
      accepted = electrified ? ["PETROL", "ELECTRIC"] : ["PETROL"];
    } else if (wanted.includes("HYBRID")) {
      accepted = ["PETROL", "ELECTRIC"]; // DVLA "HYBRID ELECTRIC" = petrol hybrid
    } else if (wanted.includes("ELECTRIC")) {
      accepted = ["ELECTRIC"]; // pure EV ("ELECTRICITY")
    }

    if (accepted) {
      if (candFuels.some((f) => accepted.some((a) => f.includes(a)))) {
        score += 20;
        if (
          electrified &&
          (candidate.fullName ?? "").toUpperCase().includes("HYBRID")
        ) {
          score += 10;
        }
      } else {
        return -1; // petrol vs diesel mismatch is disqualifying
      }
    }
    // Unrecognised fuel strings (gas, steam…) don't gate at all.
  }

  const year = details.yearOfManufacture;
  if (year) {
    const from = parseYear(candidate.madeFrom);
    const until = parseYear(candidate.madeUntil);
    const inRange =
      (from == null || year >= from) && (until == null || year <= until);
    if (inRange) score += 15;
    // Out-of-range isn't disqualifying — DVLA "first registered" can trail the
    // production window (import, pre-reg) — it just doesn't earn the points.
  }

  return score;
}

function parseYear(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = /^(\d{4})/.exec(raw);
  return m ? Number(m[1]) : null;
}

/** Pick the best-scoring acceptable candidate (ties → first). */
export function pickBestCandidate(
  candidates: HpCarType[],
  details: VehicleDetailsInput,
): HpCarType | null {
  let best: HpCarType | null = null;
  let bestScore = -1;
  for (const c of candidates) {
    if (c.id == null) continue;
    const s = scoreCandidate(c, details);
    if (s > bestScore) {
      best = c;
      bestScore = s;
    }
  }
  return bestScore >= 0 ? best : null;
}

// ---------------------------------------------------------------------------
// Resolution + cache.
// ---------------------------------------------------------------------------

/**
 * Resolve a reg to its cached-or-fresh HaynesPro identity. Returns null when
 * the vehicle can't be resolved (unknown reg, no HaynesPro coverage, API down).
 */
export async function resolveVehicle(
  reg: string,
  db: DbClient,
): Promise<ResolvedVehicle | null> {
  const key = cacheRegKey(reg);
  if (!key) return null;

  const failedUntil = negativeCache.get(key);
  if (failedUntil && failedUntil > Date.now()) return null;

  // 1. Cache.
  const { data: cached } = await db
    .from("haynespro_vehicle_cache")
    .select(
      "reg, car_type_id, repairtime_type_id, description, hp_make, hp_model_label, resolved_via, expires_at",
    )
    .eq("reg", key)
    .maybeSingle();
  // A MANUAL row is a customer telling us which car this actually is, and it
  // outranks anything the fuzzy matcher would produce from DVLA's make and
  // model strings — that guess is what they were correcting. So it never
  // expires and is never overwritten: letting the TTL lapse would silently
  // revert the price to the wrong variant a month later, which is the exact
  // failure this feature exists to fix. (`expires_at` is also written far
  // future, so this holds even if a row is read by something that doesn't
  // know the rule.)
  const manual = cached?.resolved_via === "manual";
  if (cached && (manual || new Date(cached.expires_at).getTime() > Date.now())) {
    return {
      reg: key,
      carTypeId: cached.car_type_id,
      repairtimeTypeId: cached.repairtime_type_id,
      description: cached.description,
      hpMake: cached.hp_make,
      hpModelLabel: cached.hp_model_label,
    };
  }

  // 2. Fresh resolution from the vehicle's details.
  const details = await loadVehicleDetails(key);
  if (!details) {
    negativeCache.set(key, Date.now() + NEGATIVE_CACHE_TTL_MS);
    return null;
  }

  const resolved = await resolveFromDetails(details);
  if (!resolved) {
    negativeCache.set(key, Date.now() + NEGATIVE_CACHE_TTL_MS);
    return null;
  }

  // 3. Cache it (upsert replaces an expired row and resets the TTL).
  await db.from("haynespro_vehicle_cache").upsert({
    reg: key,
    car_type_id: resolved.carTypeId,
    repairtime_type_id: resolved.repairtimeTypeId,
    description: resolved.description,
    hp_make: resolved.hpMake,
    hp_model_label: resolved.hpModelLabel,
    resolved_via: resolved.via,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
  });

  return {
    reg: key,
    carTypeId: resolved.carTypeId,
    repairtimeTypeId: resolved.repairtimeTypeId,
    description: resolved.description,
    hpMake: resolved.hpMake,
    hpModelLabel: resolved.hpModelLabel,
  };
}

// ---------------------------------------------------------------------------
// Internals.
// ---------------------------------------------------------------------------

/**
 * Details come from the existing DVLA VES + DVSA MOT lookup (which has its own
 * in-memory cache and stub mode). Imported dynamically: lib/dvla is
 * "server-only" and this module's pure helpers are unit-tested.
 */
async function loadVehicleDetails(reg: string): Promise<VehicleDetailsInput | null> {
  try {
    const { lookupVehicleAction } = await import("@/app/actions/lookup-vehicle");
    const result = await lookupVehicleAction(reg);
    if (!result.ok) return null;
    const d = result.details;
    return {
      make: d.make,
      model: d.model ?? null,
      engineCapacity: d.engineCapacity ?? null,
      fuelType: d.fuelType ?? null,
      yearOfManufacture: d.yearOfManufacture ?? null,
    };
  } catch {
    return null;
  }
}

interface InternalResolution {
  carTypeId: number;
  repairtimeTypeId: number | null;
  description: string | null;
  hpMake: string | null;
  hpModelLabel: string | null;
  via: "vin" | "details";
}

async function resolveFromDetails(
  details: VehicleDetailsInput,
): Promise<InternalResolution | null> {
  // Preferred path once the VRM supplier lands: decode the VIN.
  if (details.vin) {
    const candidates = await haynesProCall<HpCarType[]>("decodeVINV4", {
      descriptionLanguage: "en",
      vin: details.vin,
    });
    const best = pickBestCandidate(candidates ?? [], details);
    if (best?.id != null) {
      const embedded = firstRepairtimeTypeId(best.repairTimeTypes);
      return {
        carTypeId: best.id,
        repairtimeTypeId:
          embedded ?? (await lookupRepairtimeTypeId(best.id)),
        description: best.fullName ?? null,
        hpMake: details.make?.toUpperCase() ?? null,
        hpModelLabel: deriveModelLabel(best.fullName, best.name),
        via: "vin",
      };
    }
    // fall through to details matching
  }

  if (!details.make || !details.model) return null;

  const candidates = await haynesProCall<HpCarType[]>("findCarTypesByDetailsV3", {
    descriptionLanguage: "en",
    makeDescription: details.make,
    wholeWordMakes: false,
    modelDescription: details.model,
    wholeWordModels: false,
    engineCapacity: details.engineCapacity ?? undefined,
    year: details.yearOfManufacture ?? undefined,
  });

  let best = pickBestCandidate(candidates ?? [], details);

  // Two server-side failure modes need a looser retry: capacity/year can
  // over-filter (DVLA 1390cc vs a HaynesPro row keyed 1391), and DVLA/DVSA
  // model strings carry trim noise HaynesPro's text search can't match
  // ("RANGER WILDTRAK ECOBLUE 4X4 A" vs "Ranger"). Walk progressively shorter
  // model prefixes with no capacity/year filter and let LOCAL scoring — hard
  // capacity + fuel gates — pick the right variant. Longest-first so a more
  // specific match always wins over a broad one ("GRAND CHEROKEE" ≠ "GRAND").
  if (!best) {
    for (const model of buildModelCandidates(details.model, details.make)) {
      const loose = await haynesProCall<HpCarType[]>("findCarTypesByDetailsV3", {
        descriptionLanguage: "en",
        makeDescription: details.make,
        wholeWordMakes: false,
        modelDescription: model,
        wholeWordModels: false,
      });
      best = pickBestCandidate(loose ?? [], details);
      if (best) break;
    }
  }
  if (best?.id == null) return null;

  return {
    carTypeId: best.id,
    repairtimeTypeId: await lookupRepairtimeTypeId(best.id),
    description: best.fullName ?? null,
    hpMake: details.make?.toUpperCase() ?? null,
    hpModelLabel: deriveModelLabel(best.fullName, best.name),
    via: "details",
  };
}

function firstRepairtimeTypeId(
  types: HpRepairtimeType[] | null | undefined,
): number | null {
  for (const t of types ?? []) {
    if (t.repairtimeTypeId != null) return t.repairtimeTypeId;
  }
  return null;
}

async function lookupRepairtimeTypeId(carTypeId: number): Promise<number | null> {
  const types = await haynesProCall<HpRepairtimeType[]>("getRepairtimeTypesV2", {
    descriptionLanguage: "en",
    carTypeId,
  });
  return firstRepairtimeTypeId(types);
}
