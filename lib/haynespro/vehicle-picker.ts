// Manual vehicle selection — MAKE → MODEL → TYPE, and the correction it writes
// (Task 20).
//
// Reg → HaynesPro vehicle is a FUZZY MATCH, not a lookup: `resolveVehicle`
// feeds DVLA's make and model strings through `buildModelCandidates` →
// `scoreCandidate` → `pickBestCandidate`, and on a long DVLA model string
// ("FORD RANGER WILDTRAK ECOBLUE 4X4 A") the engine variant it lands on is a
// guess between several plausible ones. A wrong variant means wrong labour
// times, which means a WRONG PRICE. This module is how a customer corrects it:
// they pick the real vehicle out of HaynesPro's own tree.
//
// Two halves:
//
//   1. The cascade (`listMakes` / `listModels` / `listTypes`) — thin, flattened
//      reads over the memoised tree in ./tree.ts. Flattened deliberately: the
//      clients see a picker's worth of fields, not HaynesPro's wire shape, so
//      the app isn't coupled to a supplier's JSON.
//   2. The correction (`applyManualVehicleSelection`) — the whole feature, and
//      the dangerous part. See the note above it before changing anything.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getHourlyRatePence } from "@/lib/pricing/calculate";
import type { CatalogueVehicle } from "./catalogue";
import { getCarTypeNode, getMakeWithModels, getMakes, getModelWithTypes, getRepairtimeTypeId } from "./tree";
import { cacheRegKey, clearNegativeCache, deriveModelLabel } from "./vehicle";
import type { HpTreeNode } from "./types";

// ---------------------------------------------------------------------------
// The flattened picker shapes.
// ---------------------------------------------------------------------------

export interface PickerMake {
  id: number;
  name: string;
}

export interface PickerModel {
  id: number;
  name: string;
  /** Production years as HaynesPro gives them — "2011" at this level, or null. */
  madeFrom: string | null;
  madeUntil: string | null;
  /** Car silhouette (svgz on haynespro-assets.com, CORS-open). Null on some models. */
  image: string | null;
}

/** The engine variant. This is the level the price actually depends on. */
export interface PickerType {
  id: number;
  name: string;
  /** Make + model + variant — "FORD Ranger 2.0 EcoBlue". */
  fullName: string;
  engineCode: string | null;
  /** As HaynesPro reports it, uppercase: "DIESEL", "ELECTRICAL", "PETROL / ELECTRIC". */
  fuelType: string | null;
  /** Engine size in cc. Null on an EV (HaynesPro reports 0). */
  capacity: number | null;
  /**
   * Power. HaynesPro's `output` is **kW**, which is why both are here: labelling
   * kW as bhp would print a Model 3 Long Range as "211 bhp" when it is 283.
   */
  outputKw: number | null;
  outputBhp: number | null;
  madeFrom: string | null;
  madeUntil: string | null;
}

/** 1 kW = 1.34102 bhp (metric horsepower is a different, smaller unit). */
export function kwToBhp(kw: number | null | undefined): number | null {
  if (typeof kw !== "number" || !Number.isFinite(kw) || kw <= 0) return null;
  return Math.round(kw * 1.34102);
}

/** HaynesPro reports 0 for "not applicable" (an EV's capacity, a make's output). */
function positive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** `fuelType` is a string at some levels and an array at others. */
export function flattenFuelType(raw: string | string[] | null | undefined): string | null {
  const parts = (Array.isArray(raw) ? raw : [raw])
    .map((f) => (f ?? "").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" / ") : null;
}

export function toPickerMake(node: HpTreeNode): PickerMake | null {
  if (node.id == null) return null;
  const name = (node.name ?? node.fullName ?? "").trim();
  return name ? { id: node.id, name } : null;
}

export function toPickerModel(node: HpTreeNode): PickerModel | null {
  if (node.id == null) return null;
  const name = (node.name ?? "").trim();
  if (!name) return null;
  return {
    id: node.id,
    name,
    madeFrom: node.madeFrom ?? null,
    madeUntil: node.madeUntil ?? null,
    image: node.image ?? null,
  };
}

export function toPickerType(node: HpTreeNode): PickerType | null {
  if (node.id == null) return null;
  const name = (node.name ?? "").trim();
  if (!name) return null;
  const outputKw = positive(node.output);
  return {
    id: node.id,
    name,
    fullName: (node.fullName ?? "").trim() || name,
    engineCode: node.engineCode?.trim() || null,
    fuelType: flattenFuelType(node.fuelType),
    capacity: positive(node.capacity),
    outputKw,
    outputBhp: kwToBhp(outputKw),
    madeFrom: node.madeFrom ?? null,
    madeUntil: node.madeUntil ?? null,
  };
}

// ---------------------------------------------------------------------------
// The cascade.
// ---------------------------------------------------------------------------
//
// Each returns null for "we can't show you a list", which the routes turn into
// a 200 refusal rather than an empty picker: HaynesPro always has ~89 makes and
// every model has types, so an empty list means an outage (or an id we don't
// know), and rendering that as "this car has no variants" would be a lie the
// customer can't act on.
//
// A tree node whose `id` is null is dropped here rather than passed through for
// the client to filter — that includes the all-null "Vehicle not found" node
// HaynesPro returns, with HTTP 200, for an id it doesn't recognise.

export async function listMakes(): Promise<PickerMake[] | null> {
  const makes = (await getMakes())
    .map(toPickerMake)
    .filter((m): m is PickerMake => m !== null);
  return makes.length > 0 ? makes : null;
}

export async function listModels(makeId: number): Promise<PickerModel[] | null> {
  const node = await getMakeWithModels(makeId);
  if (node?.id == null) return null;
  return (node.subElements ?? [])
    .map(toPickerModel)
    .filter((m): m is PickerModel => m !== null);
}

export async function listTypes(modelId: number): Promise<PickerType[] | null> {
  const node = await getModelWithTypes(modelId);
  if (node?.id == null) return null;
  return (node.subElements ?? [])
    .map(toPickerType)
    .filter((t): t is PickerType => t !== null);
}

// ---------------------------------------------------------------------------
// The make guard.
// ---------------------------------------------------------------------------

/**
 * DVLA make strings and HaynesPro make names for the same manufacturer.
 * Everything else is handled by normalisation plus the prefix rule below;
 * these are the pairs where neither is a prefix of the other.
 */
const MAKE_ALIASES: Record<string, string> = {
  VW: "VOLKSWAGEN",
  MERCEDES: "MERCEDESBENZ",
  MERC: "MERCEDESBENZ",
  LDV: "MAXUSLDV",
  GWM: "GREATWALLGWM",
};

/** Uppercase, de-accent, letters and digits only: "CITROËN" and "Citroen" agree. */
function normaliseMake(raw: string | null | undefined): string {
  const stripped = (raw ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
  return MAKE_ALIASES[stripped] ?? stripped;
}

/**
 * Does the chosen vehicle's make agree with the make DVLA holds for the reg?
 *
 * **This is the guard that makes the correction safe to expose.** The vehicle
 * cache is keyed on reg alone with no customer scoping, so one person's
 * correction moves that plate's price for everyone, web customers included.
 * That is right when it is the right car — and an open door otherwise. DVLA is
 * authoritative on MAKE; it is the variant that is ambiguous. So a Ranger may
 * be repointed at any other Ranger (or any other Ford), and never at a 911.
 *
 * Either-direction prefix, not equality, because the two sources spell the same
 * manufacturer differently: DVLA's "MG MOTOR UK LTD" against HaynesPro's "MG",
 * "GREAT WALL" against "GREAT WALL (GWM)", "DS AUTOMOBILES" against "DS".
 * Checked against the live 89-make list on 2026-09-01: **no HaynesPro make name
 * is a prefix of another** (the near misses — ALPINA/ALPINE, VOLKSWAGEN/VOLVO —
 * both diverge), so the prefix rule cannot let one make masquerade as another.
 * Pure — unit-tested.
 */
export function makesMatch(
  dvlaMake: string | null | undefined,
  hpMake: string | null | undefined,
): boolean {
  const a = normaliseMake(dvlaMake);
  const b = normaliseMake(hpMake);
  if (!a || !b) return false;
  return a.startsWith(b) || b.startsWith(a);
}

// ---------------------------------------------------------------------------
// The correction.
// ---------------------------------------------------------------------------

export type ManualVehicleResult =
  | { ok: true; vehicle: CatalogueVehicle }
  | {
      ok: false;
      /** What the app branches on. `error` is what it shows the customer. */
      code: "type_unknown" | "vehicle_unknown" | "make_mismatch" | "no_coverage" | "unavailable";
      error: string;
    };

export interface ManualVehicleInput {
  reg: string;
  carTypeId: number;
  /** The VERIFIED caller, for the audit trail. Never taken from a request body. */
  callerId: string;
}

/**
 * Point a registration at a customer-chosen HaynesPro car type.
 *
 * **This changes what every priced endpoint quotes, with no signature change
 * anywhere.** `resolveVehicle` caches its answer in `haynespro_vehicle_cache`
 * keyed on the normalised reg, and every priced path goes through that cache —
 * /repairs/tree, /repairs/search, /quote, /checkout/prepare, POST /bookings, on
 * web and mobile alike. So the correction only has to write the row; the cache
 * IS the seam. Do not add a `carTypeId` override to the pricing endpoints — five
 * routes would be five places to forget it.
 *
 * Which means the row has to be written COMPLETELY. Half of it is not "some
 * fields are stale", it is a wrong price:
 *
 *   repairtime_type_id  the dataset the labour times come from. Null = no
 *                       coverage, and we refuse rather than write a row that
 *                       can't be priced.
 *   hp_model_label      `excludedRepairNodeIdsForVehicle` matches the admin's
 *                       per-model repair exclusions on THIS. Leaving the old
 *                       label attaches the old car's exclusions to the new one
 *                       — silently, and in the direction of quoting repairs
 *                       that are meant to be switched off.
 *   resolved_via        'manual' is also the don't-re-resolve flag.
 *   resolved_by/_at     without them a mispriced booking is untraceable: you
 *                       cannot tell a bad fuzzy match from a deliberate change.
 *
 * Everything about the chosen vehicle comes from the TYPE node HaynesPro
 * returns for `carTypeId`, never from the request: the body carries an id, and
 * the id is the only thing we trust it for.
 */
export async function applyManualVehicleSelection(
  { reg, carTypeId, callerId }: ManualVehicleInput,
  db: SupabaseClient,
): Promise<ManualVehicleResult> {
  const key = cacheRegKey(reg);
  if (!key) {
    return { ok: false, code: "vehicle_unknown", error: "Enter your registration number." };
  }

  // What did they actually pick? Ids are namespaced per level upstream — the
  // same integer is a make at MAKE level and some unrelated car at TYPE level —
  // so the node that comes back, not the id we sent, is the authority.
  const type = await getCarTypeNode(carTypeId);
  if (!type) {
    return {
      ok: false,
      code: "type_unknown",
      error: "We couldn't find that vehicle. Please pick it from the list again.",
    };
  }

  const hpMake = await makeNameForType(type);
  if (!hpMake) {
    return {
      ok: false,
      code: "unavailable",
      error:
        "We can't change your vehicle at the moment — that's a problem on our side. " +
        "Please try again a little later.",
    };
  }

  // DVLA is authoritative on make, so a reg we can't look up can't be guarded,
  // and an unguarded write to shared pricing state is the thing we refuse.
  const details = await lookupDetails(key);
  if (!details) {
    return {
      ok: false,
      code: "vehicle_unknown",
      error:
        "We couldn't check that registration with DVLA, so we can't change the " +
        "vehicle for it. Please try again a little later.",
    };
  }

  if (!makesMatch(details.make, hpMake)) {
    return {
      ok: false,
      code: "make_mismatch",
      error:
        `DVLA has this registration down as a ${titleCase(details.make)}, so we can't ` +
        `change it to a ${titleCase(hpMake)}. Pick a different ${titleCase(details.make)}, ` +
        `or get in touch and we'll sort it for you.`,
    };
  }

  // No repair-times dataset means the vehicle they just chose cannot be priced
  // at all. Refuse and leave the existing row alone: an unpriceable row would
  // break the funnel for a reg that was working a moment ago.
  const repairtimeTypeId = await getRepairtimeTypeId(carTypeId);
  if (repairtimeTypeId == null) {
    return {
      ok: false,
      code: "no_coverage",
      error:
        "We don't have repair times for that exact vehicle, so we can't price " +
        "repairs for it. Please pick another variant, or get in touch and we'll " +
        "sort it for you.",
    };
  }

  const description = (type.fullName ?? "").trim() || (type.name ?? "").trim() || null;
  const { error } = await db.from("haynespro_vehicle_cache").upsert({
    reg: key,
    car_type_id: carTypeId,
    repairtime_type_id: repairtimeTypeId,
    description,
    // DVLA-sourced and uppercased, matching what the fuzzy path stores.
    hp_make: details.make?.toUpperCase() ?? null,
    // The SAME derivation the fuzzy path uses ("FORD Ranger 2.0 EcoBlue" minus
    // "2.0 EcoBlue" → "FORD Ranger"), so exclusions match either way in.
    hp_model_label: deriveModelLabel(type.fullName, type.name),
    resolved_via: "manual",
    resolved_by: callerId,
    resolved_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    // Far future, belt-and-braces with the `resolved_via = 'manual'` check in
    // resolveVehicle: a correction that expired would quietly revert to the
    // wrong guess a month later, which is the bug this feature exists to fix.
    expires_at: MANUAL_EXPIRY.toISOString(),
  });
  if (error) {
    // Named rather than dumped: a PostgrestError stringifies to `{}`, and the
    // most likely cause by far is `resolved_by` / `resolved_at` / the widened
    // `resolved_via` constraint not being there yet.
    console.error(
      `[haynespro] manual vehicle write failed for ${key}: ${error.message} ` +
        `(${error.code ?? "no code"}). ` +
        `Has migration 0051_manual_vehicle_selection.sql been applied?`,
    );
    return {
      ok: false,
      code: "unavailable",
      error: "We couldn't save your vehicle just then. Please try again.",
    };
  }

  // This reg may have failed to resolve minutes ago, and that failure is cached
  // in memory ahead of the database read.
  clearNegativeCache(key);

  return {
    ok: true,
    vehicle: {
      description: description ?? "vehicle",
      hourlyRatePence: await getHourlyRatePence(db),
    },
  };
}

/** 2126 — "never", written as a date because the column is not nullable. */
const MANUAL_EXPIRY = new Date("2126-01-01T00:00:00.000Z");

/**
 * The make a TYPE node belongs to, by walking up its own branch: TYPE →
 * `superElementId` (its MODEL) → that model's `superElementId` (its MAKE) →
 * the make's name. Both hops are memoised, and both are the calls the customer
 * just made to reach the picker, so this is normally free.
 */
async function makeNameForType(type: HpTreeNode): Promise<string | null> {
  const modelId = type.superElementId;
  if (modelId == null) return null;

  const model = await getModelWithTypes(modelId);
  const makeId = model?.id != null ? model.superElementId : null;
  if (makeId == null) return null;

  const make = (await getMakes()).find((m) => m.id === makeId);
  return make?.name?.trim() || null;
}

/**
 * DVLA make for the reg. Imported dynamically: lib/dvla is "server-only" and
 * this module's pure helpers are unit-tested — same reason as ./vehicle.ts.
 */
async function lookupDetails(reg: string): Promise<{ make: string | null } | null> {
  try {
    const { lookupVehicleAction } = await import("@/app/actions/lookup-vehicle");
    const result = await lookupVehicleAction(reg);
    return result.ok ? { make: result.details.make ?? null } : null;
  } catch {
    return null;
  }
}

/** "MERCEDES-BENZ" → "Mercedes-Benz", for a sentence the customer reads. */
function titleCase(raw: string | null | undefined): string {
  return (raw ?? "")
    .toLowerCase()
    .replace(/(^|[\s\-/(])([a-z])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase());
}
