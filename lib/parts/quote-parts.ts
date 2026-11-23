// The parts a set of HaynesPro jobs needs, priced from Alliance Automotive
// (Task 43).
//
// HaynesPro names the TecDoc part groups each job uses. Every group is charged
// unless an admin switched it off (a tool, not a part). A group's part is the
// admin's chosen part for this engine variant when AAG still lists it,
// otherwise AAG's best-rated part, dearest within that rating. A job that names
// an axle takes that axle's part; one that names neither, on a group AAG lists
// for both axles, takes one per axle. Each job carries its own parts, like
// labour (owner decisions, 2026-09-15).
//
// A charged group AAG can't price (down, blocked or listing nothing, with no
// answer from the last 7 days) takes the admin's set price for the group when
// there is one (migration 0071: consumables AAG doesn't list). Otherwise the
// set is unpriceable and goes to a manual quote. Estimating it from other
// cars of the same model (Task 72) is switched off: see
// PART_ESTIMATES_ENABLED.

import type { SupabaseClient } from "@supabase/supabase-js";

import { aagRegKey } from "@/lib/aag/client";
import { loadAagPartOffers, type AagPartOffers } from "./aag-part-prices";
import {
  estimatePart,
  loadPartEstimates,
  type EstimateBasis,
  type EstimateRow,
  type EstimateVehicle,
} from "./part-estimates";
import { isMissingColumn, loadPartGroupSettings, type PartGroupSetPrice } from "./part-group-settings";
import { alternativePairs } from "./job-charges";
import { loadModelPartOffers, loadVehicleModel } from "./model-parts";
import { recordPartGaps } from "./part-gaps";
import {
  isSportsModel,
  jobPosition,
  selectJobParts,
  type CarTraits,
  type FluidNeed,
  type RepairPartChoiceRow,
} from "./repair-part-choice";
import { fluidCapacitiesFor, type FluidCapacities } from "@/lib/haynespro/fluid-capacity";
import { BRAKE_PART_TYPES, brakeLayout, notFittedOnCar, type BrakeLayout } from "./brake-layout";
import { applyPartsMarkup, loadPartsMarkupRate } from "./parts-markup";
import type { PartPosition, PartSide, SupplierId } from "./supplier-offer";

/** One part priced into a quote. Serialisable: it is snapshotted onto bookings and revisions. */
export interface QuotedPart {
  /** The HaynesPro job it belongs to. */
  nodeId: string;
  genartId: number;
  /** HaynesPro's name for the part group, e.g. "Air filter". */
  groupLabel: string;
  /** Null for a set price or an estimate: no supplier part was priced. */
  supplier: SupplierId | null;
  /** Null for a set price. */
  partNumber: string | null;
  brand: string | null;
  description: string | null;
  imageUrl: string | null;
  position: PartPosition | null;
  /** ADDITIVE (Task 78). The side, when the job buys one part per side (left and right shock absorbers). */
  side?: PartSide | null;
  /** AAG's rating: "Good", "Better", "Best". */
  rating: string | null;
  /** Units bought, in the supplier's unit of issue: 2 for brake discs. */
  quantity: number;
  /**
   * What the customer pays per unit: supplier cost (or the set price), with
   * the admin's parts markup when it's on (parts-markup.ts, 2026-11-18).
   */
  unitPence: number;
  /** unitPence × quantity. */
  linePence: number;
  /** ADDITIVE (2026-11-18). The supplier's cost per unit, before the markup. Only when a markup was applied. */
  costUnitPence?: number;
  /** ADDITIVE (2026-11-18). The markup applied (0.2 = 20%). Only when one was. */
  markupRate?: number;
  /**
   * "chosen": an admin picked it for this engine variant. "default": AAG's
   * best-rated, dearest within. "estimate": AAG had no price for this car, so
   * it was estimated from other cars of the same model (Task 72; see `estimate`). "set_price":
   * AAG had no price and there was no estimate, so the admin's set price for
   * the part group.
   */
  source: "chosen" | "default" | "estimate" | "set_price";
  /** ADDITIVE (Task 72). Where an estimate came from; only on `source: "estimate"`. */
  estimate?: { basis: EstimateBasis; samples: number };
  /** True when AAG couldn't answer and its answer from the last 7 days was used. */
  lastKnown: boolean;
  /** ADDITIVE (Task 76). Priced from an unambiguous answer in NAPA's full catalogue. Absent otherwise. */
  fromCatalogue?: true;
  /**
   * ADDITIVE (Task 77). NAPA lists nothing for this car, so an admin's pick
   * for the model, at NAPA's live price (source "chosen"). Absent otherwise.
   */
  modelPart?: true;
  /** When the price was given (by AAG, or set by the admin), ISO. */
  pricedAt: string;
}

export interface PartsJob {
  nodeId: string;
  /** The job's name: an axle in it ("front", "rear") narrows its parts. */
  description: string;
  groups: Array<{ genartId: number; label: string }>;
}

export interface MissingPart {
  nodeId: string;
  genartId: number;
  label: string;
  position: PartPosition | null;
  /**
   * Why it has no price. "not_listed": NAPA answered and has nothing we can
   * use for this car (lists nothing, or nothing that fits). "unavailable":
   * NAPA didn't answer (down, slow, blocked). Either way the job goes to a
   * manual quote (Brad, 2026-11-17); the reason is kept for the logs.
   * "not_fitted" (2026-11-18): the car doesn't have this part on that axle
   * (rear discs on a car with rear drums, brake-layout.ts). The repair is
   * hidden from the car's repair list rather than quoted.
   */
  reason: MissingReason;
}

export type MissingReason = "not_listed" | "unavailable" | "not_fitted";

/**
 * Whether a job set's missing parts need pricing by hand: any part with no
 * price, whether NAPA lists nothing usable or didn't answer at all (Brad,
 * 2026-11-17: "if it doesn't return then it should go to get a quote"). Pure.
 */
export function needsManualQuote(missing: readonly Pick<MissingPart, "reason">[]): boolean {
  return missing.length > 0;
}

/**
 * The parts that could be priced, and any charged group that couldn't. `ok`
 * only when nothing is missing; `parts` is filled either way, so a mechanic's
 * suggestions can still show what was priced.
 */
export type JobPartsResult =
  | { ok: true; parts: QuotedPart[] }
  | { ok: false; parts: QuotedPart[]; missing: MissingPart[] };

/**
 * Whether a part NAPA can't price for this car is estimated from other cars
 * of the same model (Task 72). Off since 2026-11-18. Brad, asked whether "we
 * are still doing this guesswork": "yes please" to switching it off. A
 * different year of a model can take a different part, so an estimate could
 * be a false price, and it kept repairs NAPA can't price out of Gareth's
 * quotes. The code stays (part-estimates.ts) in case it's wanted back.
 */
export const PART_ESTIMATES_ENABLED = false;

/** The key a repair part choice is looked up by. */
export function choiceKey(nodeId: string, genartId: number): string {
  return `${nodeId}:${genartId}`;
}

/**
 * Which fluid a part type is, by HaynesPro's label: "Antifreeze", "Coolant",
 * "Brake fluid". Not "Coolant pump" or "Sensor, coolant temperature". Pure.
 */
export function fluidKind(label: string | null | undefined): FluidNeed["kind"] | null {
  const text = label?.trim() ?? "";
  if (/^brake fluid\b/i.test(text)) return "brake_fluid";
  if (/^(antifreeze|coolant)\b/i.test(text) && !/pump|sensor|hose|tank|thermostat|radiator|pipe|flange|cap|switch|valve/i.test(text)) {
    return "coolant";
  }
  return null;
}

/** The litres a part type needs on this car, when it's a fluid and HaynesPro says how much the car holds. Pure. */
export function fluidNeedFor(label: string, fluids: FluidCapacities | null | undefined): FluidNeed | null {
  const kind = fluidKind(label);
  if (!kind || !fluids) return null;
  const litres = kind === "coolant" ? fluids.coolantLitres : fluids.brakeFluidLitres;
  return litres ? { kind, litres } : null;
}

/** Price every job's parts from the offers already loaded. Pure, unit-tested. */
export function priceJobParts(args: {
  jobs: readonly PartsJob[];
  offers: ReadonlyMap<number, AagPartOffers>;
  choices?: ReadonlyMap<string, RepairPartChoiceRow>;
  uncharged?: ReadonlySet<number>;
  setPrices?: ReadonlyMap<number, PartGroupSetPrice>;
  /** Other cars' AAG answers to estimate from (Task 72), with the car being priced. */
  estimates?: { vehicle: EstimateVehicle; rows: ReadonlyMap<number, readonly EstimateRow[]> };
  /** When estimates are priced, ISO. */
  now?: string;
  /** The car's coolant and brake fluid capacities, so a fluid is bought by the litres it needs. */
  fluids?: FluidCapacities | null;
  /** Standard or sports suspension parts (standard when absent). */
  car?: CarTraits | null;
  /** Discs or drums on each axle, when NAPA's answers settle it. */
  brakes?: BrakeLayout | null;
}): JobPartsResult {
  const parts: QuotedPart[] = [];
  const missing: MissingPart[] = [];

  const unpriced = (
    job: PartsJob,
    group: PartsJob["groups"][number],
    position: PartPosition | null,
    reason: MissingReason,
  ) => {
    if (notFittedOnCar(group.genartId, position, args.brakes)) {
      missing.push({ nodeId: job.nodeId, genartId: group.genartId, label: group.label, position, reason: "not_fitted" });
      return;
    }
    const estimate = args.estimates
      ? estimatePart({
          jobDescription: job.description,
          position,
          vehicle: args.estimates.vehicle,
          rows: args.estimates.rows.get(group.genartId) ?? [],
        })
      : null;
    if (estimate) {
      parts.push({
        nodeId: job.nodeId,
        genartId: group.genartId,
        groupLabel: group.label,
        supplier: null,
        partNumber: null,
        brand: null,
        description: null,
        imageUrl: null,
        position,
        rating: null,
        quantity: estimate.quantity,
        unitPence: estimate.unitPence,
        linePence: estimate.linePence,
        source: "estimate",
        estimate: { basis: estimate.basis, samples: estimate.samples },
        lastKnown: false,
        pricedAt: args.now ?? new Date().toISOString(),
      });
      return;
    }
    const set = args.setPrices?.get(group.genartId);
    if (!set) {
      // Left and right can both be missing: the gap is one part type on one axle.
      const known = missing.some((m) => m.nodeId === job.nodeId && m.genartId === group.genartId && m.position === position);
      if (!known) missing.push({ nodeId: job.nodeId, genartId: group.genartId, label: group.label, position, reason });
      return;
    }
    parts.push({
      nodeId: job.nodeId,
      genartId: group.genartId,
      groupLabel: group.label,
      supplier: null,
      partNumber: null,
      brand: null,
      description: null,
      imageUrl: null,
      position,
      rating: null,
      quantity: 1,
      unitPence: set.pence,
      linePence: set.pence,
      source: "set_price",
      lastKnown: false,
      pricedAt: set.setAt,
    });
  };

  for (const job of args.jobs) {
    const skipped = alternativesToSkip(job, args.offers, args.uncharged);
    for (const group of job.groups) {
      if (args.uncharged?.has(group.genartId) || skipped.has(group.genartId)) continue;
      const lookup = args.offers.get(group.genartId);
      if (!lookup || lookup.state !== "ok") {
        unpriced(job, group, jobPosition(job.description), lookup?.state === "empty" ? "not_listed" : "unavailable");
        continue;
      }
      const choice = args.choices?.get(choiceKey(job.nodeId, group.genartId)) ?? null;
      for (const { position, side, selection, quantity: wanted } of selectJobParts(job.description, lookup.offers, choice, fluidNeedFor(group.label, args.fluids), args.car)) {
        // NAPA listed the part type for this car, but nothing that fits, or
        // not how many a job renewing every one of them needs.
        if (selection.source === "none" || selection.offer.costPence == null || wanted === null) {
          unpriced(job, group, position, "not_listed");
          continue;
        }
        const offer = selection.offer;
        const unitPence = offer.costPence as number;
        const quantity = wanted && wanted > 0 ? wanted : 1;
        parts.push({
          nodeId: job.nodeId,
          genartId: group.genartId,
          groupLabel: group.label,
          supplier: offer.supplier,
          partNumber: offer.partNumber,
          brand: offer.brand,
          description: offer.description,
          imageUrl: offer.imageUrl,
          position: offer.position ?? position,
          ...(side ? { side } : {}),
          rating: offer.tier,
          quantity,
          unitPence,
          linePence: unitPence * quantity,
          source: selection.source === "choice" || offer.modelPart ? "chosen" : "default",
          lastKnown: lookup.lastKnown,
          pricedAt: lookup.pricedAt,
          ...(offer.fromCatalogue ? { fromCatalogue: true as const } : {}),
          ...(offer.modelPart ? { modelPart: true as const } : {}),
        });
      }
    }
  }

  return missing.length > 0 ? { ok: false, parts, missing } : { ok: true, parts };
}

/**
 * A job that lists a part and its kit side by side ("Wheel bearing" and
 * "Wheel bearing kit") charges one of them (Task 73): the kit when NAPA has a
 * buyable price for it, otherwise the single part. Returns the ids to skip.
 */
function alternativesToSkip(
  job: PartsJob,
  offers: ReadonlyMap<number, AagPartOffers>,
  uncharged: ReadonlySet<number> | undefined,
): Set<number> {
  const skip = new Set<number>();
  for (const { single, kit } of alternativePairs(job.groups)) {
    const lookup = offers.get(kit);
    const kitPriced =
      !uncharged?.has(kit) &&
      lookup?.state === "ok" &&
      lookup.offers.some((offer) => offer.buyable && offer.costPence != null);
    skip.add(kitPriced ? single : kit);
  }
  return skip;
}

/** Each gap's HaynesPro name and a repair that needs it. */
function gapSightings(jobs: readonly PartsJob[], gaps: readonly number[]) {
  const wanted = new Set(gaps);
  return jobs.flatMap((job) =>
    job.groups
      .filter((group) => wanted.has(group.genartId))
      .map((group) => ({ genartId: group.genartId, label: group.label, sampleRepair: job.description || null })),
  );
}

/** Whether the car is a sports model, from HaynesPro's name for it. Standard when unknown. Never throws. */
export async function loadCarTraits(db: SupabaseClient, reg: string): Promise<CarTraits> {
  try {
    const { data } = await db.from("haynespro_vehicle_cache").select("description").eq("reg", aagRegKey(reg)).maybeSingle();
    return { sports: isSportsModel((data as { description?: string | null } | null)?.description) };
  } catch {
    return { sports: false };
  }
}

async function loadChoices(
  db: SupabaseClient,
  carTypeId: number,
  nodeIds: readonly string[],
): Promise<Map<string, RepairPartChoiceRow>> {
  try {
    const { data } = await db
      .from("repair_part_choices")
      .select("car_type_id, node_id, genart_id, supplier, part_number, brand, description, chosen_at")
      .eq("car_type_id", carTypeId)
      .in("node_id", [...nodeIds]);
    return new Map(((data ?? []) as RepairPartChoiceRow[]).map((r) => [choiceKey(r.node_id, r.genart_id), r]));
  } catch {
    return new Map();
  }
}

/**
 * The AAG parts a set of jobs on one vehicle needs, at the customer's price:
 * with the admin's parts markup when it's on (parts-markup.ts). Parts pricing
 * is off (an empty list, labour-only as before) while migration 0070 is
 * missing. Never throws.
 */
export async function quoteJobParts(args: {
  db: SupabaseClient;
  reg: string;
  carTypeId: number;
  jobs: readonly PartsJob[];
}): Promise<JobPartsResult> {
  const [result, markup] = await Promise.all([quoteJobPartsAtCost(args), loadPartsMarkupRate(args.db)]);
  return { ...result, parts: applyPartsMarkup(result.parts, markup) };
}

/** quoteJobParts at the supplier's cost, before any markup. */
async function quoteJobPartsAtCost(args: {
  db: SupabaseClient;
  reg: string;
  carTypeId: number;
  jobs: readonly PartsJob[];
}): Promise<JobPartsResult> {
  const genartIds = [...new Set(args.jobs.flatMap((job) => job.groups.map((g) => g.genartId)))];
  if (genartIds.length === 0) return { ok: true, parts: [] };

  const settings = await loadPartGroupSettings(args.db, genartIds);
  if (!settings.enabled) return { ok: true, parts: [] };
  const charged = genartIds.filter((id) => !settings.uncharged.has(id));
  if (charged.length === 0) return { ok: true, parts: [] };

  const hasFluid = args.jobs.some((job) => job.groups.some((g) => !settings.uncharged.has(g.genartId) && fluidKind(g.label)));
  const [offers, choices, fluids, car] = await Promise.all([
    loadAagPartOffers(args.db, args.reg, charged),
    loadChoices(args.db, args.carTypeId, args.jobs.map((job) => job.nodeId)),
    hasFluid ? fluidCapacitiesFor(args.carTypeId) : Promise.resolve(null),
    loadCarTraits(args.db, args.reg),
  ]);
  if (!offers.enabled) return { ok: true, parts: [] };

  // Part types NAPA has nothing for on this car (Task 77): use the admin's
  // pick for the model where there is one, and record the gap for the Parts
  // gaps screen either way.
  const gaps = charged.filter((id) => offers.byGenart.get(id)?.state !== "ok");
  if (gaps.length > 0) {
    const model = await loadVehicleModel(args.db, args.reg);
    if (model) {
      const [picked] = await Promise.all([
        loadModelPartOffers(args.db, model, gaps),
        recordPartGaps(args.db, model, args.reg, gapSightings(args.jobs, gaps)),
      ]);
      for (const [genartId, lookup] of picked) offers.byGenart.set(genartId, lookup);
    }
  }

  const first = priceJobParts({
    jobs: args.jobs,
    offers: offers.byGenart,
    choices,
    uncharged: settings.uncharged,
    setPrices: settings.setPrices,
    fluids,
    car,
  });
  if (first.ok) return first;

  // A brake part NAPA has nothing for on one axle: does the car have discs or
  // drums there? Only then is the brake layout read (brake-layout.ts).
  let brakes: BrakeLayout | null = null;
  if (first.missing.some((m) => m.position && BRAKE_PART_TYPES.includes(m.genartId))) {
    const extra = BRAKE_PART_TYPES.filter((id) => !offers.byGenart.has(id));
    const more = extra.length > 0 ? await loadAagPartOffers(args.db, args.reg, extra) : null;
    const answers = new Map(offers.byGenart);
    if (more?.enabled) for (const [id, answer] of more.byGenart) answers.set(id, answer);
    brakes = brakeLayout(answers);
  }
  const priced = brakes
    ? priceJobParts({
        jobs: args.jobs,
        offers: offers.byGenart,
        choices,
        uncharged: settings.uncharged,
        setPrices: settings.setPrices,
        fluids,
        car,
        brakes,
      })
    : first;
  if (priced.ok) return priced;

  // Something NAPA couldn't price on this car: a manual quote. Estimating it
  // from other cars of the same model (Task 72) is off (PART_ESTIMATES_ENABLED).
  // A part the car doesn't have is never estimated: its repair is hidden.
  if (!PART_ESTIMATES_ENABLED) return priced;
  const toEstimate = priced.missing.filter((m) => m.reason !== "not_fitted");
  if (toEstimate.length === 0) return priced;
  const estimates = await loadPartEstimates(
    args.db,
    aagRegKey(args.reg),
    toEstimate.map((m) => m.genartId),
  );
  if (!estimates) return priced;
  return priceJobParts({
    jobs: args.jobs,
    offers: offers.byGenart,
    choices,
    uncharged: settings.uncharged,
    setPrices: settings.setPrices,
    estimates,
    fluids,
    car,
    brakes,
  });
}

/** "Brake disc (front)", "Shock absorber (front left)": the part group, with its axle and side when there are. */
export function partGroupName(part: Pick<QuotedPart, "groupLabel" | "position" | "side">): string {
  const where = [part.position, part.side].filter(Boolean).join(" ");
  return where ? `${part.groupLabel} (${where})` : part.groupLabel;
}

/**
 * The `booking_parts` rows (migration 0070) for parts priced into a booking.
 * The mechanic buys them (`sourcing: 'self'`), so the payout already covers them.
 */
export function catalogueBookingPartRows(bookingId: string, parts: readonly QuotedPart[]) {
  return parts.map((part) => ({
    booking_id: bookingId,
    part_id: null,
    part_name: part.brand ? `${partGroupName(part)} · ${part.brand}` : partGroupName(part),
    quantity: part.quantity,
    unit_price_pence: part.unitPence,
    total_pence: part.linePence,
    sourcing: "self",
    status: "pending",
    source: "catalogue",
    supplier: part.supplier,
    supplier_part_number: part.partNumber,
    brand: part.brand,
    genart_id: part.genartId,
    node_id: part.nodeId,
    priced_at: part.pricedAt,
    // Migration 0087 (Task 72). Named on EVERY row: supabase-js fills a key
    // one row of a bulk insert lacks with NULL, not the column default, so
    // naming it only on estimated rows broke its not-null whenever a booking
    // mixed estimated and NAPA-priced parts (2026-11-23). If the column is
    // ever missing, insertCatalogueBookingParts retries without it.
    price_estimated: part.source === "estimate",
  }));
}

/**
 * Insert the rows `catalogueBookingPartRows` built. Until migration 0087 adds
 * `price_estimated`, a row carrying it would fail the whole insert, so it is
 * retried without the flag: the price is still right, only the marker is lost.
 */
export async function insertCatalogueBookingParts(
  db: SupabaseClient,
  rows: ReturnType<typeof catalogueBookingPartRows>,
): Promise<{ error: { code?: string; message?: string } | null }> {
  const first = await db.from("booking_parts").insert(rows);
  if (!first.error || !isMissingColumn(first.error) || !rows.some((r) => "price_estimated" in r)) return first;
  console.error("[parts] booking_parts.price_estimated is missing (migration 0087); saving without it");
  return db.from("booking_parts").insert(
    rows.map((row) => {
      const rest: Record<string, unknown> = { ...row };
      delete rest.price_estimated;
      return rest;
    }),
  );
}

/**
 * A priced part as the customer app reads it: the `parts` lines of
 * POST /api/mobile/v1/quote and /checkout/prepare. One mapper, so the two
 * responses can't drift. A contract: add fields, never rename or remove them.
 */
export interface CustomerPartLine {
  /** The job it belongs to. */
  nodeId: string;
  /** HaynesPro's name for the part group, e.g. "Brake disc". */
  name: string;
  /** Null for a set price or an estimate. */
  brand: string | null;
  position: PartPosition | null;
  /**
   * ADDITIVE (Task 78). The side, when the job buys one part per side: a
   * front-shocks job has a "left" and a "right" line of the same name. Absent otherwise.
   */
  side?: PartSide;
  quantity: number;
  unitPence: number;
  linePence: number;
  /**
   * ADDITIVE (Task 72). True when no supplier priced this part for the car, so
   * the price is estimated from other cars of the same model. Say so beside the line.
   */
  estimated: boolean;
}

export function customerPartLines(parts: readonly QuotedPart[]): CustomerPartLine[] {
  return parts.map((part) => ({
    nodeId: part.nodeId,
    name: part.groupLabel,
    brand: part.brand,
    position: part.position,
    ...(part.side ? { side: part.side } : {}),
    quantity: part.quantity,
    unitPence: part.unitPence,
    linePence: part.linePence,
    estimated: part.source === "estimate",
  }));
}
