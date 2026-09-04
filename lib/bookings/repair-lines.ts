// A booking's job lines, for every surface that shows what was booked (Task 24).
// Pure.
//
// Multi-job bookings keep their lines in booking_repairs (0055). Single-job
// and pre-Task-24 bookings have no rows there — their one job lives in the
// booking's own repair_node_id / repair_description, as it always did. This
// module hides that difference: readers call repairLinesFor() and always get
// a list.

export interface RepairLineLite {
  nodeId: string;
  description: string;
  /** Hours charged for this line after overlap removal (0 = covered by another job). */
  chargedHours: number;
  /** The combined repair this job came from (Task 26); absent/null for a job booked on its own. */
  itemId?: string | null;
  itemLabel?: string | null;
}

/** A booking_repairs row as supabase-js returns it (numerics arrive as strings). */
export interface BookingRepairRow {
  position: number | null;
  node_id: string;
  description: string | null;
  raw_hours: number | string | null;
  charged_hours: number | string | null;
  line_pence: number | null;
  /** 0056 — absent on rows read before that migration. */
  item_id?: string | null;
  item_label?: string | null;
}

export interface RepairLineView {
  position: number;
  nodeId: string | null;
  description: string;
  /** Standalone book time; null on a legacy booking without it. */
  rawHours: number | null;
  /** After overlap removal; null on a synthetic (single/legacy) line. */
  chargedHours: number | null;
  linePence: number | null;
  /** The combined repair this job came from; null for a job booked on its own. */
  itemId: string | null;
  itemLabel: string | null;
  /** True when the line was derived from the booking row rather than booking_repairs. */
  synthetic: boolean;
}

/** Lines grouped as the customer chose them: one entry per combined repair, one per plain job. */
export interface RepairLineGroup<T extends { itemId?: string | null; itemLabel?: string | null; nodeId: string | null }> {
  key: string;
  label: string | null;
  lines: T[];
}

export function groupRepairLines<T extends { itemId?: string | null; itemLabel?: string | null; nodeId: string | null }>(
  lines: readonly T[],
): RepairLineGroup<T>[] {
  const groups: RepairLineGroup<T>[] = [];
  const byKey = new Map<string, RepairLineGroup<T>>();
  for (const line of lines) {
    const key = line.itemLabel ? (line.itemId ?? line.itemLabel) : `node:${line.nodeId ?? groups.length}`;
    let group = byKey.get(key);
    if (!group) {
      group = { key, label: line.itemLabel ?? null, lines: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.lines.push(line);
  }
  return groups;
}

const FALLBACK_DESCRIPTION = "Vehicle repair";

function toNumber(value: number | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * The one-line name of a booking: its first job, plus "+ N more jobs" when
 * there are more. This is what bookings.repair_description stores for a
 * multi-job booking, so every list, email and text that shows one string
 * keeps working.
 */
export function repairSummary(descriptions: readonly string[]): string {
  const [first, ...rest] = descriptions.map((d) => d.trim()).filter(Boolean);
  if (!first) return FALLBACK_DESCRIPTION;
  if (rest.length === 0) return first;
  return `${first} + ${rest.length} more job${rest.length === 1 ? "" : "s"}`;
}

/**
 * The job lines of a booking, in order. Rows from booking_repairs when there
 * are any; otherwise one synthetic line from the booking's own columns.
 */
export function repairLinesFor(
  booking: {
    repair_node_id?: string | null;
    repair_description?: string | null;
    vehicle_raw_duration_hours?: number | string | null;
  },
  lines: readonly BookingRepairRow[] | null | undefined,
): RepairLineView[] {
  const rows = (lines ?? []).filter((r) => r && typeof r.node_id === "string" && r.node_id);
  if (rows.length > 0) {
    return rows
      .map((r, index) => ({
        position: typeof r.position === "number" ? r.position : index,
        nodeId: r.node_id,
        description: r.description?.trim() || FALLBACK_DESCRIPTION,
        rawHours: toNumber(r.raw_hours),
        chargedHours: toNumber(r.charged_hours),
        linePence: typeof r.line_pence === "number" ? r.line_pence : null,
        itemId: r.item_id ?? null,
        itemLabel: r.item_label?.trim() || null,
        synthetic: false,
      }))
      .sort((a, b) => a.position - b.position);
  }
  return [
    {
      position: 0,
      nodeId: booking.repair_node_id ?? null,
      description: booking.repair_description?.trim() || FALLBACK_DESCRIPTION,
      rawHours: toNumber(booking.vehicle_raw_duration_hours),
      chargedHours: null,
      linePence: null,
      itemId: null,
      itemLabel: null,
      synthetic: true,
    },
  ];
}

export function isMultiJob(lines: readonly RepairLineView[]): boolean {
  return lines.length > 1;
}
