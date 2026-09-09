// The job sheet as a plain, serialisable snapshot (Task 37). Pure — unit-tested.
//
// A revision stores the job as BOOKED (`before`) and as the mechanic now says
// it should be (`after`) in exactly this shape, so the customer's approval
// page, the audit trail and the apply step never depend on a later HaynesPro
// reprice. `before` is built from the booking row and its lines/parts;
// `after` from a fresh RepairsQuote (the same pricing the checkout ran) plus
// the parts the mechanic kept, added or removed.
//
// Money: the five figures map 1:1 onto the bookings columns —
//   basePricePence → base_price_pence, partsPricePence → parts_price_pence,
//   totalPence → total_pence, platformFeePence, mechanicPayoutPence.
// An approved Task 33 quote for extra work sits ON TOP of the job; the
// snapshots describe the job alone, so `approvedExtras` is subtracted from
// the booking's figures to get `before` and added back when `after` is
// applied (lib/revisions/apply.ts).

import type { OilQuote } from "@/lib/catalogue/products";
import { repairLinesFor, repairSummary, type BookingRepairRow } from "@/lib/bookings/repair-lines";
import type { RepairsQuote } from "@/lib/haynespro/repair-booking";
import { splitCommission } from "@/lib/quotes/pricing";
import type { QuoteView } from "@/lib/quotes/load";

export interface RevisionLine {
  nodeId: string;
  description: string;
  rawHours: number;
  chargedHours: number;
  linePence: number;
  kind: "job" | "product";
  productId: string | null;
  /** The chosen catalogue item this line came from (a combined repair's option, or the job itself). */
  itemId: string | null;
  itemLabel: string | null;
}

export interface RevisionPart {
  /** booking_parts.id when the part already exists on the booking; null for one the mechanic is adding. */
  id: string | null;
  partId: string | null;
  name: string;
  quantity: number;
  unitPence: number;
  linePence: number;
  sourcing: "self" | "bmt";
}

export interface RevisionSnapshot {
  /** The catalogue ids as chosen — what `quoteRepairs` takes and what "Book again" carries. */
  repairIds: string[];
  lines: RevisionLine[];
  parts: RevisionPart[];
  repairDescription: string;
  serviceDurationHours: number;
  /** Raw book time before the 1h minimum (bookings.vehicle_raw_duration_hours). */
  rawHours: number | null;
  combineSource: string | null;
  oil: OilQuote | null;
  hourlyRatePence: number;
  commissionRate: number;
  basePricePence: number;
  partsPricePence: number;
  totalPence: number;
  platformFeePence: number;
  mechanicPayoutPence: number;
}

export interface MoneyExtras {
  totalPence: number;
  labourPence: number;
  partsPence: number;
  platformFeePence: number;
  mechanicPayoutPence: number;
}

export const NO_EXTRAS: MoneyExtras = { totalPence: 0, labourPence: 0, partsPence: 0, platformFeePence: 0, mechanicPayoutPence: 0 };

/**
 * What approved Task 33 quotes have added to the booking's figures. A
 * revision's own hold quote is NOT extra work — it is the payment vehicle for
 * the difference — so callers pass its id to leave it out.
 */
export function approvedExtras(quotes: readonly QuoteView[], excludeQuoteIds: ReadonlySet<string> = new Set()): MoneyExtras {
  const extras = { ...NO_EXTRAS };
  for (const q of quotes) {
    if (q.kind !== "now" || q.status !== "approved" || excludeQuoteIds.has(q.id)) continue;
    extras.totalPence += q.totalPence;
    extras.labourPence += q.labourPence;
    extras.partsPence += q.partsPence;
    extras.platformFeePence += q.platformFeePence;
    extras.mechanicPayoutPence += q.mechanicPayoutPence;
  }
  return extras;
}

export interface BookingPartRow {
  id: string;
  part_id: string | null;
  part_name: string;
  quantity: number;
  unit_price_pence: number;
  total_pence: number;
  sourcing: string | null;
}

export function partFromRow(row: BookingPartRow): RevisionPart {
  return {
    id: row.id,
    partId: row.part_id ?? null,
    name: row.part_name,
    quantity: row.quantity,
    unitPence: row.unit_price_pence,
    linePence: row.total_pence,
    sourcing: row.sourcing === "bmt" ? "bmt" : "self",
  };
}

/** The chosen ids behind a set of lines: a combined repair once, by its option id; a plain job by its node. */
export function repairIdsFromLines(lines: readonly { nodeId: string | null; itemId: string | null; itemLabel: string | null }[]): string[] {
  const ids: string[] = [];
  for (const l of lines) {
    const id = l.itemLabel ? (l.itemId ?? l.nodeId) : l.nodeId;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export interface SnapshotBooking {
  repair_node_id: string | null;
  repair_description: string | null;
  service_duration_hours: number | string | null;
  vehicle_raw_duration_hours: number | string | null;
  combine_source: string | null;
  engine_oil_litres: number | string | null;
  engine_oil_price_per_litre_pence: number | null;
  engine_oil_source: string | null;
  hourly_rate_pence: number | null;
  commission_rate: number | string | null;
  base_price_pence: number | null;
  parts_price_pence: number | null;
  total_pence: number | null;
  platform_fee_pence: number | null;
  mechanic_payout_pence: number | null;
}

const num = (v: number | string | null | undefined, fallback = 0): number => {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/** The job as booked, from the booking row and its lines/parts, with any approved extra work taken off. */
export function snapshotFromBooking(
  booking: SnapshotBooking,
  lineRows: readonly BookingRepairRow[] | null | undefined,
  partRows: readonly BookingPartRow[] | null | undefined,
  extras: MoneyExtras = NO_EXTRAS,
): RevisionSnapshot {
  const views = repairLinesFor(booking, lineRows);
  const duration = num(booking.service_duration_hours, 1);
  const lines: RevisionLine[] = views.map((v) => ({
    nodeId: v.nodeId ?? "",
    description: v.description,
    rawHours: v.rawHours ?? (v.synthetic ? num(booking.vehicle_raw_duration_hours, duration) : 0),
    chargedHours: v.chargedHours ?? (v.synthetic ? duration : 0),
    linePence: v.linePence ?? (v.synthetic ? Math.max(0, num(booking.base_price_pence) - extras.labourPence) : 0),
    kind: v.product ? "product" : "job",
    productId: v.product && v.nodeId?.startsWith("p:") ? v.nodeId.slice(2) : null,
    itemId: v.itemId,
    itemLabel: v.itemLabel,
  }));
  const oil: OilQuote | null =
    booking.engine_oil_litres != null && booking.engine_oil_price_per_litre_pence != null
      ? {
          litres: num(booking.engine_oil_litres),
          pencePerLitre: booking.engine_oil_price_per_litre_pence,
          pence: Math.round(num(booking.engine_oil_litres) * booking.engine_oil_price_per_litre_pence),
          source: booking.engine_oil_source === "default" ? "default" : "haynespro",
          label: null,
        }
      : null;
  return {
    repairIds: repairIdsFromLines(lines),
    lines,
    parts: (partRows ?? []).map(partFromRow),
    repairDescription: booking.repair_description?.trim() || repairSummary(lines.map((l) => l.description)),
    serviceDurationHours: duration,
    rawHours: booking.vehicle_raw_duration_hours == null ? null : num(booking.vehicle_raw_duration_hours),
    combineSource: booking.combine_source ?? null,
    oil,
    hourlyRatePence: booking.hourly_rate_pence ?? 0,
    commissionRate: num(booking.commission_rate, 0.15),
    basePricePence: Math.max(0, num(booking.base_price_pence) - extras.labourPence),
    partsPricePence: Math.max(0, num(booking.parts_price_pence) - extras.partsPence),
    totalPence: Math.max(0, num(booking.total_pence) - extras.totalPence),
    platformFeePence: Math.max(0, num(booking.platform_fee_pence) - extras.platformFeePence),
    mechanicPayoutPence: Math.max(0, num(booking.mechanic_payout_pence) - extras.mechanicPayoutPence),
  };
}

/**
 * The job as revised: a fresh RepairsQuote for the chosen ids (priced at the
 * booking's snapshotted rate and commission) plus the parts. Parts are priced
 * quantity × unit on top of the quote's own parts line (engine oil), the way
 * computePrice adds parts: total = base + parts, fee = round(total × rate),
 * payout = total − fee − any BMT-sourced parts (the rule in booking-parts.ts).
 */
export function snapshotFromQuote(quote: RepairsQuote, parts: readonly RevisionPart[]): RevisionSnapshot {
  const lines: RevisionLine[] = quote.lines.map((l) => ({
    nodeId: l.nodeId,
    description: l.description,
    rawHours: l.rawHours,
    chargedHours: l.chargedHours,
    linePence: l.linePence,
    kind: l.kind === "product" ? "product" : "job",
    productId: l.productId ?? null,
    itemId: l.itemId ?? null,
    itemLabel: l.itemLabel ?? null,
  }));
  const partsSum = parts.reduce((s, p) => s + p.linePence, 0);
  const bmtParts = parts.filter((p) => p.sourcing === "bmt").reduce((s, p) => s + p.linePence, 0);
  const basePricePence = quote.breakdown.basePence;
  const partsPricePence = quote.breakdown.partsPence + partsSum;
  const totalPence = basePricePence + partsPricePence;
  const split = splitCommission(totalPence, quote.breakdown.commissionRate);
  return {
    repairIds: [...quote.itemIds],
    lines,
    parts: parts.map((p) => ({ ...p })),
    repairDescription: quote.description,
    serviceDurationHours: quote.breakdown.durationHours,
    rawHours: quote.breakdown.vehicleRawDurationHours ?? quote.combinedRawHours,
    combineSource: lines.length > 1 ? quote.combineSource : null,
    oil: quote.oil,
    hourlyRatePence: quote.breakdown.hourlyRatePence,
    commissionRate: quote.breakdown.commissionRate,
    basePricePence,
    partsPricePence,
    totalPence,
    platformFeePence: split.platformFeePence,
    mechanicPayoutPence: Math.max(0, split.mechanicPayoutPence - bmtParts),
  };
}

/** Read a stored snapshot back defensively — jsonb from the row, never trusted blindly. */
export function parseSnapshot(value: unknown): RevisionSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const arr = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);
  return {
    repairIds: arr<string>(v.repairIds).filter((s) => typeof s === "string"),
    lines: arr<RevisionLine>(v.lines),
    parts: arr<RevisionPart>(v.parts),
    repairDescription: typeof v.repairDescription === "string" ? v.repairDescription : "Vehicle repair",
    serviceDurationHours: num(v.serviceDurationHours as number, 1),
    rawHours: v.rawHours == null ? null : num(v.rawHours as number),
    combineSource: typeof v.combineSource === "string" ? v.combineSource : null,
    oil: (v.oil as OilQuote | null) ?? null,
    hourlyRatePence: num(v.hourlyRatePence as number),
    commissionRate: num(v.commissionRate as number, 0.15),
    basePricePence: num(v.basePricePence as number),
    partsPricePence: num(v.partsPricePence as number),
    totalPence: num(v.totalPence as number),
    platformFeePence: num(v.platformFeePence as number),
    mechanicPayoutPence: num(v.mechanicPayoutPence as number),
  };
}
