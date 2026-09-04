// HaynesPro's basket calculation — processRepairTasksV4 — parsed. Pure, no I/O.
//
// Given several repair-tree leaves, HaynesPro returns each one's time AFTER
// overlap removal (`calculatedTime`, hours × 100; 0 when the work is entirely
// covered by another item in the basket) plus the basket's `totalRepairTime`.
// Verified live 2026-09-04 on a Golf VII (repairtimeTypeId 115566):
//
//   [Renew both front brake discs 110, Renew the front brake pads 80]
//     → totalRepairTime 110 · discs 110 · pads 0        (a naive sum is 190)
//   [Renew the front brake pads]                → 80     (same as getRepairtimeNodesV4)
//   [front brake pads 80, rear brake pads 80]   → 160    (nothing overlaps)
//
// Two things about the reply worth knowing:
//   - the envelope is an OBJECT ({ status, totalRepairTime, basketItems }),
//     not the array most repair-time operations return;
//   - items must be matched by id, never by position, and the basket does not
//     say WHICH item absorbed a zeroed line (its includedList names
//     sub-operations with different ids), so the honest label for a 0 line is
//     "covered by the other work", not "included with X".
//
// The reply also prices the basket from the labour rates we send. Those
// figures are ignored: the price comes from lib/pricing/calculate.ts.

export interface CombinedRepairLine {
  id: string;
  description: string | null;
  /** Hours × 100 after overlap removal. 0 = fully covered by another item. */
  calculatedTime: number;
  /** MECHANICAL | BODY | ELECTRONICS — HaynesPro's labour-rate category. */
  jobType: string | null;
}

export interface CombinedRepairTimes {
  /** Hours × 100 for the whole basket — the authority for the combined time. */
  totalRepairTime: number;
  /** Basket order. Look items up by id. */
  items: CombinedRepairLine[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function nonNegativeInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * Parse a processRepairTasksV4 reply for `requestedIds`. Null — meaning "fall
 * back to a plain sum" — whenever the reply can't be trusted: not an object,
 * a non-zero status, no basket, a requested id missing from it, an id listed
 * twice, a non-integer or negative time, or a zero total. Never throws.
 */
export function parseProcessRepairTasks(
  payload: unknown,
  requestedIds: readonly string[],
): CombinedRepairTimes | null {
  if (!isRecord(payload)) return null;

  const status = payload.status;
  if (isRecord(status) && typeof status.statusCode === "number" && status.statusCode !== 0) {
    return null;
  }

  const totalRepairTime = nonNegativeInt(payload.totalRepairTime);
  if (totalRepairTime == null || totalRepairTime === 0) return null;

  const raw = payload.basketItems;
  if (!Array.isArray(raw)) return null;

  const items: CombinedRepairLine[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id) return null;
    if (seen.has(item.id)) return null;
    const calculatedTime = nonNegativeInt(item.calculatedTime);
    if (calculatedTime == null) return null;
    seen.add(item.id);
    items.push({
      id: item.id,
      description: typeof item.description === "string" ? item.description : null,
      calculatedTime,
      jobType: typeof item.jobType === "string" ? item.jobType : null,
    });
  }

  for (const id of requestedIds) {
    if (!seen.has(id)) return null;
  }

  return { totalRepairTime, items };
}
