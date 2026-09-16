// The supplier parts every bookable row on a browse level needs (Task 63), so
// the catalogue can show a customer what a job costs instead of "£60 + parts".
//
// It prices through lib/parts/quote-parts.ts — the same function the quote
// itself uses — so a row's figure is what the price step will charge, not a
// second estimate that can drift from it. Rows are priced in ONE call for the
// whole level: Alliance Automotive is asked per part group per registration
// and siblings share their groups (front and rear pads are both genart 402),
// so a level of fifteen repairs is usually a handful of lookups, and the
// answers are cached per reg for 12 hours (lib/parts/aag-part-prices.ts).
//
// Two things it deliberately will NOT do:
//
//  - **Guess.** A part group with no usable price leaves its row unpriced, and
//    the client falls back to "+ parts". A quote for that job would refuse the
//    booking outright (PARTS_UNAVAILABLE_MESSAGE); quoting a total we know is
//    short of the truth would be worse than saying we don't know it yet.
//  - **Hold up the page.** A cold registration means live supplier calls, so
//    the whole pass is bounded by LEVEL_PARTS_BUDGET_MS. Past that the level
//    renders with "+ parts" as it did before. The abandoned work still
//    finishes and still writes the price cache, so the next level — or a
//    reload — has it.

import type { SupabaseClient } from "@supabase/supabase-js";

import { partGroupsOnNodes } from "@/lib/parts/part-groups";
import { quoteJobParts, type JobPartsResult, type PartsJob } from "@/lib/parts/quote-parts";
import type { HpRepairtimeNode } from "@/lib/haynespro/types";

/**
 * How long a level will wait for supplier prices before rendering without
 * them. Above the 4s per-call timeout customer pricing uses
 * (AAG_CUSTOMER_TIMEOUT_MS), since the calls run in parallel: one slow group
 * shouldn't cost the level its other rows' prices.
 */
export const LEVEL_PARTS_BUDGET_MS = 4_500;

/** One bookable row and the HaynesPro jobs behind it (several for a combined repair). */
export interface PartsRow {
  /** The catalogue node id as the customer books it — a node id, or "b:<uuid>". */
  rowId: string;
  nodes: HpRepairtimeNode[];
}

/**
 * Parts cost in pence per row id, for rows that could be priced in full.
 * A row is absent when any part group one of its jobs needs has no price.
 */
export type LevelParts = Map<string, number>;

const EMPTY: LevelParts = new Map();

/** The job description parts pricing reads — the same one `quoteRepairsResult` passes. */
function jobDescription(node: HpRepairtimeNode): string {
  return node.description?.trim() || "Vehicle repair";
}

/** A job's part groups as `quoteJobParts` wants them. */
function partsJob(node: HpRepairtimeNode): PartsJob {
  return {
    nodeId: node.id as string,
    description: jobDescription(node),
    groups: partGroupsOnNodes([node]).map((g) => ({
      genartId: g.genartId,
      label: g.description || `Part group ${g.genartId}`,
    })),
  };
}

/** Sum a priced result into per-row totals, dropping any row with a part we couldn't price. */
export function foldLevelParts(rows: readonly PartsRow[], result: JobPartsResult): LevelParts {
  const byNode = new Map<string, number>();
  for (const part of result.parts) {
    byNode.set(part.nodeId, (byNode.get(part.nodeId) ?? 0) + part.linePence);
  }
  const unpriced = new Set(result.ok ? [] : result.missing.map((m) => m.nodeId));

  const out: LevelParts = new Map();
  for (const row of rows) {
    if (row.nodes.some((n) => n.id == null || unpriced.has(n.id))) continue;
    let pence = 0;
    for (const node of row.nodes) pence += byNode.get(node.id as string) ?? 0;
    out.set(row.rowId, pence);
  }
  return out;
}

/**
 * Price the parts for a level's bookable rows. Never throws: a supplier that
 * is down, slow or unconfigured gives an empty map and the level reads exactly
 * as it did before parts were priced at all.
 */
export async function priceLevelParts(args: {
  db: SupabaseClient;
  reg: string;
  carTypeId: number;
  rows: readonly PartsRow[];
  /** Overridable for tests. */
  budgetMs?: number;
}): Promise<LevelParts> {
  // A row whose jobs name no part group needs nothing priced: its labour is
  // already the whole price, and asking about it would be a wasted lookup.
  const rows = args.rows.filter((row) =>
    row.nodes.some((n) => n.id != null && (n.genarts?.length ?? 0) > 0),
  );
  if (rows.length === 0) return EMPTY;

  const jobs = new Map<string, PartsJob>();
  for (const row of rows) {
    for (const node of row.nodes) {
      if (node.id == null || jobs.has(node.id)) continue;
      jobs.set(node.id, partsJob(node));
    }
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), args.budgetMs ?? LEVEL_PARTS_BUDGET_MS);
  });
  try {
    const result = await Promise.race([
      quoteJobParts({ db: args.db, reg: args.reg, carTypeId: args.carTypeId, jobs: [...jobs.values()] }),
      timeout,
    ]);
    return result ? foldLevelParts(rows, result) : EMPTY;
  } catch (err) {
    console.error("[catalogue] pricing a level's parts failed:", err);
    return EMPTY;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
