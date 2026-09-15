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
// set is unpriceable: the booking stops rather than go out without its parts.

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadAagPartOffers, type AagPartOffers } from "./aag-part-prices";
import { loadPartGroupSettings, type PartGroupSetPrice } from "./part-group-settings";
import { jobPosition, selectJobParts, type RepairPartChoiceRow } from "./repair-part-choice";
import type { PartPosition, SupplierId } from "./supplier-offer";

/** One part priced into a quote. Serialisable: it is snapshotted onto bookings and revisions. */
export interface QuotedPart {
  /** The HaynesPro job it belongs to. */
  nodeId: string;
  genartId: number;
  /** HaynesPro's name for the part group, e.g. "Air filter". */
  groupLabel: string;
  /** Null for a set price: no supplier part was priced. */
  supplier: SupplierId | null;
  /** Null for a set price. */
  partNumber: string | null;
  brand: string | null;
  description: string | null;
  imageUrl: string | null;
  position: PartPosition | null;
  /** AAG's rating: "Good", "Better", "Best". */
  rating: string | null;
  /** Units bought, in the supplier's unit of issue: 2 for brake discs. */
  quantity: number;
  /** Supplier cost per unit, no mark-up; or the set price. */
  unitPence: number;
  /** unitPence × quantity. */
  linePence: number;
  /**
   * "chosen": an admin picked it for this engine variant. "default": AAG's
   * best-rated, dearest within. "set_price": AAG had no price, so the admin's
   * set price for the part group.
   */
  source: "chosen" | "default" | "set_price";
  /** True when AAG couldn't answer and its answer from the last 7 days was used. */
  lastKnown: boolean;
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
}

/**
 * The parts that could be priced, and any charged group that couldn't. `ok`
 * only when nothing is missing; `parts` is filled either way, so a mechanic's
 * suggestions can still show what was priced.
 */
export type JobPartsResult =
  | { ok: true; parts: QuotedPart[] }
  | { ok: false; parts: QuotedPart[]; missing: MissingPart[] };

/** The key a repair part choice is looked up by. */
export function choiceKey(nodeId: string, genartId: number): string {
  return `${nodeId}:${genartId}`;
}

/** Price every job's parts from the offers already loaded. Pure, unit-tested. */
export function priceJobParts(args: {
  jobs: readonly PartsJob[];
  offers: ReadonlyMap<number, AagPartOffers>;
  choices?: ReadonlyMap<string, RepairPartChoiceRow>;
  uncharged?: ReadonlySet<number>;
  setPrices?: ReadonlyMap<number, PartGroupSetPrice>;
}): JobPartsResult {
  const parts: QuotedPart[] = [];
  const missing: MissingPart[] = [];

  const unpriced = (job: PartsJob, group: PartsJob["groups"][number], position: PartPosition | null) => {
    const set = args.setPrices?.get(group.genartId);
    if (!set) {
      missing.push({ nodeId: job.nodeId, genartId: group.genartId, label: group.label, position });
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
    for (const group of job.groups) {
      if (args.uncharged?.has(group.genartId)) continue;
      const lookup = args.offers.get(group.genartId);
      if (!lookup || lookup.state !== "ok") {
        unpriced(job, group, jobPosition(job.description));
        continue;
      }
      const choice = args.choices?.get(choiceKey(job.nodeId, group.genartId)) ?? null;
      for (const { position, selection } of selectJobParts(job.description, lookup.offers, choice)) {
        if (selection.source === "none" || selection.offer.costPence == null) {
          unpriced(job, group, position);
          continue;
        }
        const offer = selection.offer;
        const unitPence = offer.costPence as number;
        const quantity = offer.quantityOfFit && offer.quantityOfFit > 0 ? offer.quantityOfFit : 1;
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
          rating: offer.tier,
          quantity,
          unitPence,
          linePence: unitPence * quantity,
          source: selection.source === "choice" ? "chosen" : "default",
          lastKnown: lookup.lastKnown,
          pricedAt: lookup.pricedAt,
        });
      }
    }
  }

  return missing.length > 0 ? { ok: false, parts, missing } : { ok: true, parts };
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
 * The AAG parts a set of jobs on one vehicle needs. Parts pricing is off (an
 * empty list, labour-only as before) while migration 0070 is missing. Never
 * throws.
 */
export async function quoteJobParts(args: {
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

  const [offers, choices] = await Promise.all([
    loadAagPartOffers(args.db, args.reg, charged),
    loadChoices(args.db, args.carTypeId, args.jobs.map((job) => job.nodeId)),
  ]);
  if (!offers.enabled) return { ok: true, parts: [] };

  return priceJobParts({
    jobs: args.jobs,
    offers: offers.byGenart,
    choices,
    uncharged: settings.uncharged,
    setPrices: settings.setPrices,
  });
}

/** "Brake disc (front)": the part group, and the axle when there is one. */
export function partGroupName(part: Pick<QuotedPart, "groupLabel" | "position">): string {
  return part.position ? `${part.groupLabel} (${part.position})` : part.groupLabel;
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
  }));
}
