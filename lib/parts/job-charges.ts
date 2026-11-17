// Which of a job's part groups it actually charges for (Task 73).
//
// HaynesPro tags every job with the part groups it *involves*, not the ones
// it *replaces*: "Check the battery" carries the same Starter battery tag as
// "Renew the battery", and "Clean the rear brake discs" carries Brake disc.
// Charging every tag charged customers for parts their job never fits.
//
// The rule (owner decisions, Brad 2026-11-17):
//   - A job that renews, replaces, fits or repairs something charges all its
//     part groups, as before.
//   - Any other job (check, charge, clean, adjust, bleed, remove/refit,
//     drain/refill, top up…) charges only its consumables: oils, fluids,
//     antifreeze, refrigerant, grease, and the gaskets, seals and stretch
//     bolts a removed part needs to go back on. A top-up keeps charging a
//     full fill, as it did before (Brad: keep a full fill).
//   - On by default for every car: a HaynesPro job id is the same repair on
//     every make, and its wording is HaynesPro's own.
//   - When a job lists a part and its kit side by side ("Wheel bearing" and
//     "Wheel bearing kit"), or the same part type twice under two ids (two
//     "Brake fluid" groups), only one is charged: the kit (or the second) when
//     NAPA prices it, otherwise the other (`alternativePairs`, at pricing time).
//
// Pure: no I/O. Unit-tested.

/** First words of jobs that fit a new part. Anything else only charges consumables. */
const REPLACING = /^(renew|replace|fit|retrofit|install|repair|overhaul|recondition)\b/i;

/**
 * Part groups used up by any job that touches them: fluids (a top-up keeps
 * charging a full fill), and the one-use fittings a removed part needs when it
 * goes back on (gaskets, seals, stretch-bolt sets). Matched on HaynesPro's
 * label from the start, so "Oil cooler, engine oil", "Pressure sensor,
 * coolant" or "Sealing cap" (parts) never match.
 */
const CONSUMABLE =
  /^(antifreeze|coolant|engine oil|brake fluid|automatic transmission fluid|transmission oil|manual transmission oil|gear oil|axle gear oil|hydraulic oil|power steering (oil|fluid)|central hydraulic (oil|fluid)|refrigerant|air conditioning cleaner|grease|lubricant|battery acid|gasket|seal|seal ring|o-ring|sealant|cylinder head bolt set|bolt set)\b/i;

/** Whether a job fits a new part. A job with no wording is treated as one, as before. */
export function isReplacingJob(description: string | null | undefined): boolean {
  const text = description?.trim() ?? "";
  return text === "" || REPLACING.test(text);
}

/** Whether a part group is a consumable (oil, fluid, refrigerant, grease). */
export function isConsumableGroup(label: string | null | undefined): boolean {
  return CONSUMABLE.test(label?.trim() ?? "");
}

/**
 * Part types HaynesPro lists wrongly on some jobs, and the right one (Task 77).
 * Each correction applies on every car, since a HaynesPro job is the same
 * repair on every make; NAPA still picks the part that fits each car.
 *
 * - "Renew the upstream / downstream / catalytic converter downstream oxygen
 *   sensor" carry "Sensor, exhaust gas temperature" (3938), a different part,
 *   instead of "Oxygen sensor" (3922). NAPA prices 3938 as exhaust gas
 *   temperature sensors (NGK 97265 on a Transit), so those jobs were quoted
 *   with the wrong part (found 2026-11-17 across 11 scanned models).
 */
const PART_TYPE_CORRECTIONS: ReadonlyArray<{
  job: RegExp;
  from: number;
  to: { id: number; description: string };
}> = [{ job: /\b(oxygen|lambda) sensor\b/i, from: 3938, to: { id: 3922, description: "Oxygen sensor" } }];

/**
 * A job's part groups with HaynesPro's known mistakes corrected, each part
 * type once. Groups without an id pass through untouched.
 */
export function correctedGroups<T extends { id?: number | null; description?: string | null }>(
  jobDescription: string | null | undefined,
  groups: readonly T[] | null | undefined,
): T[] {
  const text = jobDescription?.trim() ?? "";
  const out: T[] = [];
  const seen = new Set<number>();
  for (const group of groups ?? []) {
    const fix = PART_TYPE_CORRECTIONS.find((c) => c.from === group.id && c.job.test(text));
    const corrected = fix ? { ...group, id: fix.to.id, description: fix.to.description } : group;
    if (typeof corrected.id === "number") {
      if (seen.has(corrected.id)) continue;
      seen.add(corrected.id);
    }
    out.push(corrected);
  }
  return out;
}

/**
 * The part groups a job charges for: all of them on a job that fits a part,
 * only the consumables otherwise, after HaynesPro's known mistakes are
 * corrected (correctedGroups).
 */
export function chargedGroups<T extends { id?: number | null; description?: string | null }>(
  jobDescription: string | null | undefined,
  groups: readonly T[] | null | undefined,
): T[] {
  const all = correctedGroups(jobDescription, groups);
  return isReplacingJob(jobDescription) ? all : all.filter((g) => isConsumableGroup(g.description));
}

/** "Bellow kit, drive shaft" and "Bellow, drive shaft" → the same key. */
function alternativeKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/\b(kit|set)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isKit(label: string): boolean {
  return /\b(kit|set)\b/i.test(label);
}

/**
 * Part groups on one job that are alternatives to each other: a part and its
 * kit, or one part type listed under two ids. Each pair is `{ single, kit }`
 * by GenArt id (for a repeated type, the first and the second). Only a clean
 * pair counts: exactly two groups with the same key.
 */
export function alternativePairs(
  groups: ReadonlyArray<{ genartId: number; label: string }>,
): Array<{ single: number; kit: number }> {
  const byKey = new Map<string, Array<{ genartId: number; label: string }>>();
  for (const group of groups) {
    const key = alternativeKey(group.label);
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), group]);
  }
  const pairs: Array<{ single: number; kit: number }> = [];
  for (const list of byKey.values()) {
    if (list.length !== 2 || list[0].genartId === list[1].genartId) continue;
    const kit = list.find((g) => isKit(g.label));
    const single = list.find((g) => !isKit(g.label));
    if (kit && single) {
      pairs.push({ single: single.genartId, kit: kit.genartId });
    } else if (list[0].label.trim().toLowerCase() === list[1].label.trim().toLowerCase()) {
      // The same part type under two ids ("Brake fluid" twice): charge one.
      pairs.push({ single: list[0].genartId, kit: list[1].genartId });
    }
  }
  return pairs;
}
