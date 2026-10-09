// Estimated part prices for when Alliance Automotive can't price a part on
// this car (Task 72).
//
// Aftermarket suppliers don't list parts for new models (a 2024 Ranger) until
// they've been on the road a few years, so for some cars no supplier price
// exists at all. Rather than show "+ parts" — which leaves the customer, Book
// My Tech and the mechanic all guessing — the part is priced from what AAG
// charged for the same part group on the closest cars we've priced
// (owner decision, 2026-10-09):
//
//   same engine variant → same make and model, any year or generation
//
// using the first of those with an answer. **Never a different model** (owner
// rule, 2026-10-09): a Ranger is estimated from other Rangers, of any year or
// generation, or not at all. The figure is the DEAREST line found plus
// ESTIMATE_MARGIN, so an estimate errs high: the mechanic
// keeps any difference when the real part is cheaper, and a dearer one goes
// through the existing extra-cost quote (Task 33), which the customer approves.
//
// The answers come from `aag_part_prices` (migration 0070), which already
// stores every AAG reply per registration and part group; the car behind each
// registration comes from `haynespro_vehicle_cache`. Nothing is asked of AAG
// here, so an estimate costs two database reads and never slows the funnel.

import type { SupabaseClient } from "@supabase/supabase-js";

import { normaliseLabel } from "@/lib/haynespro/exclusions";
import { jobPosition, selectJobParts } from "./repair-part-choice";
import type { PartPosition, SupplierOffer } from "./supplier-offer";

/** Added to the dearest price found, so an estimate errs high (owner decision, 2026-10-09). */
export const ESTIMATE_MARGIN = 0.15;
/** AAG answers older than this are too stale to estimate from. */
export const ESTIMATE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;
/** Rows read per part group: the most recent, which is plenty to find a dearest. */
const ROWS_PER_GROUP = 500;

/** How close the cars an estimate came from are to this one. Never wider than the model. */
export type EstimateBasis = "variant" | "model";

/** The car being priced, as `haynespro_vehicle_cache` knows it. */
export interface EstimateVehicle {
  reg: string;
  carTypeId: number | null;
  make: string | null;
  modelLabel: string | null;
}

/** One stored AAG answer for a part group on another car. */
export interface EstimateRow {
  reg: string;
  genartId: number;
  offers: SupplierOffer[];
  vehicle: Omit<EstimateVehicle, "reg"> | null;
}

export interface PartEstimate {
  /** Per unit, margin included, whole pence. */
  unitPence: number;
  quantity: number;
  linePence: number;
  basis: EstimateBasis;
  /** How many cars at that basis had a price. */
  samples: number;
}

const BASES: EstimateBasis[] = ["variant", "model"];

const ROMAN = /^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)$/;

/**
 * The model with its generation taken off, so every year of it matches
 * (owner rule, 2026-10-09: older models of the same car count). HaynesPro's
 * labels carry the generation: "FORD Fiesta Mk VI", "SEAT Leon III (5F)",
 * "VAUXHALL Corsa D (S07)", "AUDI A6 /Allroad (4G)". This drops the make, any
 * "(…)" chassis codes, "/…" body variants, "Mk …", and a trailing roman
 * numeral or single letter, never the last word left: "FIESTA", "LEON",
 * "CORSA", "A6", "3" (BMW 3), "MODEL 3". Pure.
 */
export function modelFamily(make: string | null | undefined, modelLabel: string | null | undefined): string | null {
  let label = normaliseLabel(modelLabel);
  const m = normaliseLabel(make);
  if (!label) return null;
  if (m && label.startsWith(`${m} `)) label = label.slice(m.length + 1);
  label = label.replace(/\([^)]*\)/g, " ").replace(/\s*\/.*$/, "").replace(/\bMK\s*\S+/g, " ");
  const words = label.split(/\s+/).filter(Boolean);
  while (words.length > 1 && (ROMAN.test(words[words.length - 1]) || /^[A-Z]$/.test(words[words.length - 1]))) words.pop();
  return words.length ? words.join(" ") : null;
}

/** Does a row's car count at this basis? Pure. */
export function matchesBasis(row: EstimateRow, vehicle: EstimateVehicle, basis: EstimateBasis): boolean {
  const other = row.vehicle;
  if (!other) return false;
  if (basis === "variant") return vehicle.carTypeId != null && other.carTypeId === vehicle.carTypeId;
  const family = modelFamily(vehicle.make, vehicle.modelLabel);
  return (
    !!family &&
    !!vehicle.make &&
    normaliseLabel(other.make) === normaliseLabel(vehicle.make) &&
    modelFamily(other.make, other.modelLabel) === family
  );
}

/**
 * What one other car's AAG answer says this job's part costs there: the part
 * our own selection would pick for the job (best-rated, dearest within), on the
 * axle wanted. Null when that car has nothing usable on that axle. Pure.
 */
export function rowLine(
  jobDescription: string,
  position: PartPosition | null,
  offers: readonly SupplierOffer[],
): { unitPence: number; quantity: number } | null {
  const wanted = position ?? jobPosition(jobDescription);
  let best: { unitPence: number; quantity: number } | null = null;
  for (const { position: at, selection } of selectJobParts(jobDescription, offers, null)) {
    if (wanted && at && at !== wanted) continue;
    if (selection.source === "none" || selection.offer.costPence == null) continue;
    const quantity = selection.offer.quantityOfFit && selection.offer.quantityOfFit > 0 ? selection.offer.quantityOfFit : 1;
    const unitPence = selection.offer.costPence;
    if (!best || unitPence * quantity > best.unitPence * best.quantity) best = { unitPence, quantity };
  }
  return best;
}

/**
 * An estimated price for one part on this car, from other cars' AAG answers
 * for the same part group. The closest basis with any answer wins; within it,
 * the dearest line, plus the margin. Null when no car of the same model has a
 * price: a different model is never used. Pure.
 */
export function estimatePart(args: {
  jobDescription: string;
  position: PartPosition | null;
  vehicle: EstimateVehicle;
  rows: readonly EstimateRow[];
}): PartEstimate | null {
  // This car's own answer is what left the part unpriced; never estimate from it.
  const others = args.rows.filter((row) => row.reg !== args.vehicle.reg);
  for (const basis of BASES) {
    let dearest: { unitPence: number; quantity: number } | null = null;
    let samples = 0;
    for (const row of others) {
      if (!matchesBasis(row, args.vehicle, basis)) continue;
      const line = rowLine(args.jobDescription, args.position, row.offers);
      if (!line) continue;
      samples += 1;
      if (!dearest || line.unitPence * line.quantity > dearest.unitPence * dearest.quantity) dearest = line;
    }
    if (dearest) {
      const unitPence = Math.ceil(dearest.unitPence * (1 + ESTIMATE_MARGIN));
      return { unitPence, quantity: dearest.quantity, linePence: unitPence * dearest.quantity, basis, samples };
    }
  }
  return null;
}

/** "Estimated from 3 cars of the same model" — for the admin pages. */
export function describeEstimate(estimate: Pick<PartEstimate, "basis" | "samples">): string {
  const cars = `${estimate.samples} ${estimate.samples === 1 ? "car" : "cars"}`;
  return estimate.basis === "variant"
    ? `Estimated from ${cars} with the same engine`
    : `Estimated from ${cars} of the same model`;
}

// ---------------------------------------------------------------------------
// Loading.
// ---------------------------------------------------------------------------

interface VehicleCacheRow {
  reg: string;
  car_type_id: number | null;
  hp_make: string | null;
  hp_model_label: string | null;
}

function toVehicle(row: VehicleCacheRow): Omit<EstimateVehicle, "reg"> {
  return { carTypeId: row.car_type_id ?? null, make: row.hp_make ?? null, modelLabel: row.hp_model_label ?? null };
}

/**
 * The car being priced, and other cars' recent AAG answers for these part
 * groups, keyed by part group. Never throws: anything unreadable means no
 * estimates, and the part stays unpriced as it would have before.
 */
export async function loadPartEstimates(
  db: SupabaseClient,
  regKey: string,
  genartIds: readonly number[],
  now: number = Date.now(),
): Promise<{ vehicle: EstimateVehicle; rows: Map<number, EstimateRow[]> } | null> {
  const ids = [...new Set(genartIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (!regKey || ids.length === 0) return null;
  try {
    const since = new Date(now - ESTIMATE_MAX_AGE_MS).toISOString();
    const [self, ...answers] = await Promise.all([
      db.from("haynespro_vehicle_cache").select("reg, car_type_id, hp_make, hp_model_label").eq("reg", regKey).maybeSingle(),
      ...ids.map((genartId) =>
        db
          .from("aag_part_prices")
          .select("reg, genart_id, offers")
          .eq("genart_id", genartId)
          .eq("state", "ok")
          .gte("fetched_at", since)
          .order("fetched_at", { ascending: false })
          .limit(ROWS_PER_GROUP),
      ),
    ]);
    const vehicle: EstimateVehicle = {
      reg: regKey,
      ...(self.data ? toVehicle(self.data as VehicleCacheRow) : { carTypeId: null, make: null, modelLabel: null }),
    };

    const raw = answers.flatMap((a) => (a.data ?? []) as Array<{ reg: string; genart_id: number; offers: SupplierOffer[] | null }>);
    const regs = [...new Set(raw.map((r) => r.reg))];
    const cars = new Map<string, Omit<EstimateVehicle, "reg">>();
    for (let i = 0; i < regs.length; i += 200) {
      const { data } = await db
        .from("haynespro_vehicle_cache")
        .select("reg, car_type_id, hp_make, hp_model_label")
        .in("reg", regs.slice(i, i + 200));
      for (const row of (data ?? []) as VehicleCacheRow[]) cars.set(row.reg, toVehicle(row));
    }

    const rows = new Map<number, EstimateRow[]>();
    for (const r of raw) {
      const list = rows.get(r.genart_id) ?? [];
      list.push({ reg: r.reg, genartId: r.genart_id, offers: r.offers ?? [], vehicle: cars.get(r.reg) ?? null });
      rows.set(r.genart_id, list);
    }
    return { vehicle, rows };
  } catch (err) {
    console.error("[parts] loading part estimates failed:", err);
    return null;
  }
}
