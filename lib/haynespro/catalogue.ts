// The bookable repair catalogue for one vehicle — the single implementation
// behind BOTH clients (Task 16 Stage G for the web browser, Task 18 Stage 2 for
// `GET /api/mobile/v1/repairs/{tree,search}`).
//
// The website renders these nodes as a server component and the mobile app
// renders the same objects as JSON. Neither owns the logic: "which repairs can
// this car have, and what do they cost" lives here, so the two clients cannot
// quote a customer different prices for the same job.
//
// Everything upstream is memoised in lib/haynespro/tree.ts (repair-time nodes,
// ~1h) and lib/haynespro/vehicle.ts (reg → car type, ~30 days in Postgres), so
// browsing a level is normally one cheap call and often none.

import type { SupabaseClient } from "@supabase/supabase-js";
import { billableHours } from "@/lib/pricing/billable";
import { getHourlyRatePence } from "@/lib/pricing/calculate";
import { isHaynesProConfigured } from "./client";
import { excludedRepairNodeIdsForVehicle } from "./exclusions";
import { isCatalogueOutage, readHaynesProHealth } from "./health";
import { getRepairtimeSubnodes } from "./tree";
import { resolveVehicle } from "./vehicle";
import type { HpRepairtimeNode } from "./types";

/** The node id HaynesPro uses for the top level of the repair-times tree. */
export const ROOT_NODE_ID = "root";

export interface CatalogueVehicle {
  /** HaynesPro's full type name — "VOLKSWAGEN Golf IV (1J) 1.4". */
  description: string;
  /** Included so a client can show a rate without a second round trip. */
  hourlyRatePence: number;
  /**
   * The vehicle's make as DVLA holds it, uppercased — "FORD".
   *
   * ADDITIVE AND OPTIONAL ON PURPOSE (same reasoning as `CatalogueFailure.retryable`):
   * a phone running an older build ignores a field it has never heard of. It is
   * here so a client offering "that's not my car" can seed the make picker
   * without a second round trip to DVLA — the manual-correction guard requires
   * the chosen vehicle to be of this make.
   */
  make?: string | null;
}

export interface CatalogueNode {
  id: string;
  description: string;
  /** `group` drills further in; `repair` is bookable and priced. */
  kind: "group" | "repair";
  /** Repairs only: exact OEM book time, floored at 1h. */
  billedHours: number | null;
  /** Repairs only: billedHours × the hourly rate. */
  pricePence: number | null;
}

/**
 * A request that ran correctly but has a negative answer. It is NOT an error —
 * the mobile routes return these with HTTP 200 and the app renders `message`
 * to the customer verbatim, so the copy is product copy.
 *
 * `code` is the contract the app branches on; adding a code is a breaking
 * change for old builds unless they treat unknown codes as `unknown`.
 */
export type CatalogueFailure = {
  ok: false;
  code: "vehicle_not_matched" | "no_repair_data";
  message: string;
  /**
   * True when the cause is an outage on OUR side (HaynesPro is unconfigured or
   * refusing our credentials) rather than anything about this registration —
   * the same reg will work once the integration is back.
   *
   * ADDITIVE AND OPTIONAL ON PURPOSE. `code` is the contract old app builds
   * branch on, so a new code would break them (see the note above); an unknown
   * extra field is ignored by any build that doesn't know it. Only `message`
   * changes for existing clients, and that is already shown verbatim.
   */
  retryable?: true;
};

export type CatalogueLevel =
  | { ok: true; vehicle: CatalogueVehicle; nodes: CatalogueNode[] }
  | CatalogueFailure;

export type CatalogueSearch =
  | {
      ok: true;
      vehicle: CatalogueVehicle;
      hits: CatalogueNode[];
      /** True when the walk stopped early — see SEARCH_MAX_EXPANSIONS. */
      truncated: boolean;
    }
  | CatalogueFailure;

const NOT_MATCHED: CatalogueFailure = {
  ok: false,
  code: "vehicle_not_matched",
  message:
    "We couldn't match your registration to our repair database, so we can't " +
    "price repairs for this vehicle online yet. Please get in touch and we'll " +
    "sort it for you.",
};

// The catalogue is down on our side. Deliberately reuses the `vehicle_not_matched`
// code rather than introducing a new one, because a phone running last month's
// build branches on that field and has never heard of any other value. What it
// does change is the sentence the customer reads: telling someone we couldn't
// match their registration, when in fact our supplier licence has lapsed, blames
// them for our problem and invites them to retype a perfectly good reg.
const CATALOGUE_UNAVAILABLE: CatalogueFailure = {
  ok: false,
  code: "vehicle_not_matched",
  retryable: true,
  message:
    "We can't price repairs online at the moment — that's a problem on our " +
    "side, not with your registration. Please get in touch and we'll sort it " +
    "for you, or try again a little later.",
};

const NO_REPAIR_DATA: CatalogueFailure = {
  ok: false,
  code: "no_repair_data",
  message:
    "There's no repair-time data for this exact vehicle yet. Please get in " +
    "touch and we'll sort it for you.",
};

// ---------------------------------------------------------------------------
// Shared context: the vehicle, its rate, and what the admin has hidden.
// ---------------------------------------------------------------------------

interface CatalogueContext {
  repairtimeTypeId: number;
  vehicle: CatalogueVehicle;
  /** Node ids switched off for this model — hidden, and never walked into. */
  excluded: Set<string>;
}

async function loadContext(
  reg: string,
  db: SupabaseClient,
): Promise<{ ok: true; context: CatalogueContext } | CatalogueFailure> {
  const resolved = await resolveVehicle(reg, db);
  if (!resolved) {
    // Nothing came back. That is either "we don't know this car" or "HaynesPro
    // isn't answering us" — indistinguishable here, so ask the recorded health
    // state which it was. Only checked on the failure path, so the normal path
    // costs nothing.
    if (!isHaynesProConfigured()) return CATALOGUE_UNAVAILABLE;
    const health = await readHaynesProHealth(db);
    if (isCatalogueOutage(health)) return CATALOGUE_UNAVAILABLE;
    return NOT_MATCHED;
  }
  if (resolved.repairtimeTypeId == null) return NO_REPAIR_DATA;

  const [hourlyRatePence, excluded] = await Promise.all([
    getHourlyRatePence(db),
    excludedRepairNodeIdsForVehicle(resolved.hpModelLabel, db),
  ]);

  return {
    ok: true,
    context: {
      repairtimeTypeId: resolved.repairtimeTypeId,
      vehicle: {
        description: resolved.description ?? "vehicle",
        hourlyRatePence,
        make: resolved.hpMake,
      },
      excluded,
    },
  };
}

/**
 * A HaynesPro node as the customer sees it, or null when it isn't presentable:
 * no id, or a leaf with no book time. An untimed leaf cannot be priced, so it
 * cannot be booked — showing it would be a dead end in both clients.
 */
export function toCatalogueNode(
  node: HpRepairtimeNode,
  hourlyRatePence: number,
): CatalogueNode | null {
  if (node.id == null) return null;
  const description = node.description?.trim() || node.id;

  if (node.hasSubnodes) {
    return { id: node.id, description, kind: "group", billedHours: null, pricePence: null };
  }

  const billed = billableHours(typeof node.value === "number" ? node.value / 100 : null);
  if (billed == null) return null;

  return {
    id: node.id,
    description,
    kind: "repair",
    billedHours: billed,
    // The same arithmetic quoteRepair uses, so the browse price and the quote
    // agree. quoteRepair remains the authority — it re-derives at booking time.
    pricePence: Math.round(billed * hourlyRatePence),
  };
}

// ---------------------------------------------------------------------------
// Browse one level.
// ---------------------------------------------------------------------------

/**
 * One level of the catalogue for `reg`. Pass a group's id to drill in; omit it
 * (or pass "root") for the top-level groups.
 */
export async function getRepairCatalogueLevel(
  reg: string,
  nodeId: string | null | undefined,
  db: SupabaseClient,
): Promise<CatalogueLevel> {
  const loaded = await loadContext(reg, db);
  if (!loaded.ok) return loaded;
  const { context } = loaded;

  const level = nodeId?.trim() || ROOT_NODE_ID;
  const raw = await getRepairtimeSubnodes(context.repairtimeTypeId, level);

  // getRepairtimeSubnodes swallows upstream failures as []. At the root that is
  // indistinguishable from "HaynesPro is down", and every vehicle with a
  // repair-time type has root groups — so an empty root is reported as missing
  // data rather than as an empty but working catalogue. Inside a group, empty
  // is a legitimate answer and stays one.
  if (level === ROOT_NODE_ID && raw.length === 0) return NO_REPAIR_DATA;

  const nodes = raw
    .filter((n) => n.id == null || !context.excluded.has(n.id))
    .map((n) => toCatalogueNode(n, context.vehicle.hourlyRatePence))
    .filter((n): n is CatalogueNode => n !== null);

  return { ok: true, vehicle: context.vehicle, nodes };
}

// ---------------------------------------------------------------------------
// Search.
// ---------------------------------------------------------------------------

/**
 * HaynesPro has no keyword search over repair times, so we walk the tree.
 *
 * The walk is capped because every uncached expansion is a metered upstream
 * call, and it is **best-first, not breadth-first**. That is not a refinement,
 * it's the difference between working and not: the tree has ~43 groups at the
 * root and the priced repairs sit two levels below them, so a breadth-first
 * walk spends its whole budget on the root's children and returns nothing.
 * Verified — a 40-expansion breadth-first walk for "brake pads" found zero
 * hits on a live T-Roc.
 *
 * What makes best-first work is that the path to a matching leaf is itself
 * named for the query: "Renew the front brake pads" lives under "Brake pads"
 * under "Brakes". So groups are expanded in order of how many query tokens
 * their own name contains, shallowest first. Groups matching nothing are still
 * expanded if budget remains — a leaf can be named unlike its parents — they
 * just go last.
 *
 * `truncated` means the queue wasn't drained, which for a tree this size is
 * the normal outcome. Both clients MUST surface it: "closest matches", never
 * "all matches".
 *
 * Expansions run in bounded-concurrency batches so the wall clock stays inside
 * a serverless request even on a cold memo.
 */
const SEARCH_MAX_EXPANSIONS = 40;
const SEARCH_MAX_HITS = 50;
const SEARCH_CONCURRENCY = 8;

/** A group waiting to be expanded, with what earned it its place in the queue. */
interface PendingGroup {
  id: string;
  depth: number;
  /** How many query tokens the group's own name contains. */
  affinity: number;
  /** Discovery order, for a stable tie-break. */
  seq: number;
}

export async function searchRepairCatalogue(
  reg: string,
  query: string,
  db: SupabaseClient,
): Promise<CatalogueSearch> {
  const loaded = await loadContext(reg, db);
  if (!loaded.ok) return loaded;
  const { context } = loaded;

  const needle = query.trim().toLowerCase();
  const tokens = needle.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    return { ok: true, vehicle: context.vehicle, hits: [], truncated: false };
  }

  const hits: Array<{ node: CatalogueNode; rank: number; order: number }> = [];
  const seen = new Set<string>();
  // Guards against spending an expansion twice on a group that HaynesPro lists
  // under more than one parent.
  const queued = new Set<string>([ROOT_NODE_ID]);
  const queue: PendingGroup[] = [{ id: ROOT_NODE_ID, depth: 0, affinity: 0, seq: 0 }];
  let expansions = 0;
  let seq = 1;

  while (queue.length > 0 && expansions < SEARCH_MAX_EXPANSIONS) {
    // Most promising first: name affinity, then shallowest, then discovery
    // order. Re-sorted each round because a round can discover a better branch
    // than anything already waiting.
    queue.sort((a, b) => b.affinity - a.affinity || a.depth - b.depth || a.seq - b.seq);

    const batch = queue.splice(
      0,
      Math.min(SEARCH_CONCURRENCY, SEARCH_MAX_EXPANSIONS - expansions),
    );
    expansions += batch.length;

    const levels = await Promise.all(
      batch.map((p) => getRepairtimeSubnodes(context.repairtimeTypeId, p.id)),
    );

    for (let i = 0; i < levels.length; i++) {
      const depth = batch[i].depth + 1;

      for (const hpNode of levels[i]) {
        if (hpNode.id == null || context.excluded.has(hpNode.id)) continue;

        const node = toCatalogueNode(hpNode, context.vehicle.hourlyRatePence);
        // Untimed leaves are dropped, but groups are still queued — an
        // unmatched group name can still contain a matching repair.
        if (node?.kind === "group" && !queued.has(node.id)) {
          queued.add(node.id);
          queue.push({
            id: node.id,
            depth,
            affinity: affinityFor(node.description, tokens),
            seq: seq++,
          });
        }
        if (!node) continue;

        const rank = matchRank(node.description, needle, tokens);
        if (rank == null) continue;

        // Dedupe on the NAME, not the id. HaynesPro files the same group under
        // several parents — a T-Roc has four distinct "Clutch" nodes — and four
        // identical rows is not a search result, it's noise. Kind is part of the
        // key so a "Brakes" group and a "Brakes" repair can coexist.
        const key = `${node.kind}:${node.description.toLowerCase()}`;
        if (seen.has(key)) continue;

        seen.add(key);
        hits.push({ node, rank, order: seq++ });
        if (hits.length >= SEARCH_MAX_HITS) {
          return finish(context, hits, true);
        }
      }
    }
  }

  return finish(context, hits, queue.length > 0);
}

/** How many query tokens appear in a group's name — the walk's priority. */
export function affinityFor(description: string, tokens: string[]): number {
  const haystack = description.toLowerCase();
  return tokens.reduce((n, t) => n + (haystack.includes(t) ? 1 : 0), 0);
}

/**
 * How well a description matches, lower being better, or null for no match.
 * Every token must appear — "brake pads front" finds "Renew the front brake
 * pads" — with whole-phrase and prefix matches promoted above that.
 *
 * `needle` and `tokens` must already be lower-cased: the caller does that once
 * per search rather than once per node, and the walk visits thousands of nodes.
 */
export function matchRank(
  description: string,
  needle: string,
  tokens: string[],
): number | null {
  const haystack = description.toLowerCase();
  if (haystack.startsWith(needle)) return 0;
  if (haystack.includes(needle)) return 1;
  return tokens.every((t) => haystack.includes(t)) ? 2 : null;
}

function finish(
  context: CatalogueContext,
  hits: Array<{ node: CatalogueNode; rank: number; order: number }>,
  truncated: boolean,
): CatalogueSearch {
  // Bookable repairs ahead of ALL groups, not merely at equal rank: someone
  // typing "clutch" wants the priced job, and a group named exactly "Clutch"
  // would otherwise out-rank "Renew the clutch" (whole-name match beats
  // all-tokens-present) and bury every repair beneath a wall of folders.
  // Groups stay on as the browse-instead fallback. Then best match, then
  // discovery order.
  hits.sort(
    (a, b) =>
      Number(a.node.kind === "group") - Number(b.node.kind === "group") ||
      a.rank - b.rank ||
      a.order - b.order,
  );

  return {
    ok: true,
    vehicle: context.vehicle,
    hits: hits.map((h) => h.node),
    truncated,
  };
}
