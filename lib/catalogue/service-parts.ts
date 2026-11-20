// The NAPA parts a service buys for the customer's car (Task 83).
//
// A product the admin made by hand (Interim, Full, Major service) names the
// part types it renews, and each is priced from NAPA for the exact car the
// same way a repair's parts are (lib/parts/quote-parts.ts): the right part in
// the right quantity, the parts markup, Gareth's per-model picks, a manual
// quote when NAPA can't price one. The product's own price is then the
// labour, with the parts on top. Engine oil stays the £/litre setting ×
// HaynesPro's capacity (includes_engine_oil). Pure: no I/O.
//
// Gareth, 2026-11-20:
//   Interim service: oil and oil filter
//   Full service: oil, oil filter, air filter
//   Major service (petrol): + cabin/pollen filter, spark plugs
//   Major service (diesel): + cabin/pollen filter, fuel filter

import type { PartsJob } from "@/lib/parts/quote-parts";

export interface ServicePartType {
  /** TecDoc part type, as NAPA prices it. */
  genartId: number;
  /** What the customer and the mechanic read on the part line. */
  label: string;
  /**
   * The job wording quantities are read from (repair-part-choice.ts
   * jobNeeds/slotQuantity): "all the spark plugs" buys one per cylinder,
   * "the oil filter" one unit of issue.
   */
  job: string;
}

/** The part types a service can buy, in the order the admin ticks them. */
export const SERVICE_PART_TYPES: readonly ServicePartType[] = [
  { genartId: 7, label: "Oil filter", job: "Renew the oil filter" },
  { genartId: 8, label: "Air filter", job: "Renew the air filter" },
  { genartId: 424, label: "Pollen filter", job: "Renew the pollen filter" },
  { genartId: 9, label: "Fuel filter", job: "Renew the fuel filter" },
  { genartId: 686, label: "Spark plugs", job: "Renew all the spark plugs" },
];

const BY_ID = new Map(SERVICE_PART_TYPES.map((t) => [t.genartId, t]));

/**
 * A product's part types from its stored ids: known ones only, each once, in
 * SERVICE_PART_TYPES order. Anything else (null, junk) is no parts.
 */
export function servicePartTypes(ids: readonly unknown[] | null | undefined): ServicePartType[] {
  if (!Array.isArray(ids)) return [];
  const wanted = new Set(ids.map((id) => Number(id)));
  return SERVICE_PART_TYPES.filter((t) => wanted.has(t.genartId));
}

/** Whether a stored id is a part type a service can buy. */
export function isServicePartType(id: number): boolean {
  return BY_ID.has(id);
}

/**
 * A product's parts as `quoteJobParts` wants them: one job per part type, all
 * under the product's own id ("p:<uuid>"), so the parts sit under the
 * service's line in the quote, the booking and both apps.
 */
export function servicePartsJobs(product: { id: string; partTypes: readonly ServicePartType[] }): PartsJob[] {
  return product.partTypes.map((type) => ({
    nodeId: product.id,
    description: type.job,
    groups: [{ genartId: type.genartId, label: type.label }],
  }));
}
