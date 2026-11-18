// Alliance Automotive's parts for one part group on one registration, cached
// for customer quotes (Task 43).
//
// A quote is recalculated at every funnel step (Price, Time, Address, Confirm,
// the card hold, the booking), so AAG's answer is kept per registration and
// part group in `aag_part_prices` (migration 0070):
//   - under 12 hours old, it is used as it is, so every step, the hold and the
//     booking see one price;
//   - older, AAG is asked again, with a short timeout so a slow supplier can't
//     stall the funnel: the standard quote, then the full catalogue when that
//     has nothing (Task 76, aag-live-offers.ts);
//   - when AAG can't answer, its last answer is used if at most 7 days old
//     (owner decision, 2026-09-15); otherwise the part can't be priced.
//
// Offers are cached, never the selection, so an admin's part choice takes
// effect at once while the price holds.

import type { SupabaseClient } from "@supabase/supabase-js";

import { aagRegKey } from "@/lib/aag/client";
import { fetchAagLiveOffers } from "./aag-live-offers";
import { loadApprovedCodeMaps } from "./code-maps";
import { engineCodeSource, type EngineCodeSource } from "./engine-codes";
import { isMissingTable } from "./part-group-settings";
import type { SupplierOffer } from "./supplier-offer";

export const AAG_PRICE_FRESH_MS = 12 * 60 * 60 * 1000;
export const AAG_PRICE_LAST_KNOWN_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Per NAPA call on the customer path. Not a time limit: every answer is
 * waited for (Brad, 2026-11-18: "should never timeout cause this can cause
 * false results and false prices"; it was 4 s, and NAPA often takes longer on
 * a car's first visit). Only a connection still silent after a minute is
 * given up on, so a dead socket can't hold a page forever. That counts as
 * NAPA not answering: never saved, never priced from, asked again next time.
 */
export const AAG_CUSTOMER_TIMEOUT_MS = 60_000;

const TABLE = "aag_part_prices";

/** A row of `aag_part_prices` (migration 0070). */
export interface AagPartPriceRow {
  reg: string;
  genart_id: number;
  state: "ok" | "empty";
  offers: SupplierOffer[];
  fetched_at: string;
}

export type AagPartOffers =
  /** AAG's parts. `lastKnown`: AAG couldn't answer now, so its answer from the last 7 days. */
  | { state: "ok"; offers: SupplierOffer[]; pricedAt: string; lastKnown: boolean }
  /** AAG answered that nothing in this part group fits the vehicle. */
  | { state: "empty"; pricedAt: string }
  /** No answer now, and none from the last 7 days. */
  | { state: "unavailable" };

export type AagFetchOutcome =
  | { kind: "ok"; offers: SupplierOffer[] }
  | { kind: "no_parts" }
  | { kind: "failed" };

function ageMs(at: string, now: number): number {
  const stamp = Date.parse(at);
  return Number.isFinite(stamp) ? now - stamp : Number.POSITIVE_INFINITY;
}

function fromRow(row: AagPartPriceRow, lastKnown: boolean): AagPartOffers {
  return row.state === "ok"
    ? { state: "ok", offers: row.offers ?? [], pricedAt: row.fetched_at, lastKnown }
    : { state: "empty", pricedAt: row.fetched_at };
}

/**
 * Offers stored before Task 78 lack the side and plug count NAPA sends, so
 * they would price one plug or one shock absorber. They still serve as a last
 * known answer, but never as a fresh one.
 */
function readForFit(row: AagPartPriceRow): boolean {
  return row.state !== "ok" || (row.offers ?? []).every((offer) => offer.fitRead || offer.modelPart);
}

/** A stored answer young enough to use without asking AAG. Pure. */
export function freshAnswer(row: AagPartPriceRow | null, now: number): AagPartOffers | null {
  if (!row || ageMs(row.fetched_at, now) >= AAG_PRICE_FRESH_MS || !readForFit(row)) return null;
  return fromRow(row, false);
}

/**
 * What to use, and what to store, once AAG has been asked. Pure, unit-tested.
 *
 * "No parts" from AAG replaces nothing it said in the last 7 days: a part that
 * disappeared from one reply keeps its last known price rather than letting a
 * booking go out without it.
 */
export function settleAagPartOffers(
  row: AagPartPriceRow | null,
  outcome: AagFetchOutcome,
  at: { reg: string; genartId: number; now: number },
): { result: AagPartOffers; write: AagPartPriceRow | null } {
  const nowIso = new Date(at.now).toISOString();
  const recent = row != null && ageMs(row.fetched_at, at.now) <= AAG_PRICE_LAST_KNOWN_MS;

  if (outcome.kind === "ok") {
    return {
      result: { state: "ok", offers: outcome.offers, pricedAt: nowIso, lastKnown: false },
      write: { reg: at.reg, genart_id: at.genartId, state: "ok", offers: outcome.offers, fetched_at: nowIso },
    };
  }
  if (outcome.kind === "no_parts") {
    if (row && recent && row.state === "ok") return { result: fromRow(row, true), write: null };
    return {
      result: { state: "empty", pricedAt: nowIso },
      write: { reg: at.reg, genart_id: at.genartId, state: "empty", offers: [], fetched_at: nowIso },
    };
  }
  if (row && recent) return { result: fromRow(row, true), write: null };
  return { result: { state: "unavailable" }, write: null };
}

/** The standard quote, then NAPA's full catalogue when it has nothing (Task 76). */
async function fetchFromAag(
  regKey: string,
  genartId: number,
  engineCodes?: EngineCodeSource,
  napaGenart?: number,
  timeoutMs: number = AAG_CUSTOMER_TIMEOUT_MS,
): Promise<AagFetchOutcome> {
  const outcome = await fetchAagLiveOffers(regKey, genartId, { timeoutMs, engineCodes, napaGenart });
  if (outcome.kind === "ok") return { kind: "ok", offers: outcome.offers };
  return outcome.kind === "no_parts" ? { kind: "no_parts" } : { kind: "failed" };
}

/**
 * Lookups already on their way to NAPA, by registration and part type, so a
 * repair list opened while the car is still being warmed (warm-parts.ts)
 * waits for the same answer rather than asking again. This server only.
 */
const inFlight = new Map<string, Promise<AagFetchOutcome>>();

function sharedFetch(
  regKey: string,
  genartId: number,
  fetch: () => Promise<AagFetchOutcome>,
): Promise<AagFetchOutcome> {
  const key = `${regKey}:${genartId}`;
  const running = inFlight.get(key);
  if (running) return running;
  const call = fetch().finally(() => inFlight.delete(key));
  inFlight.set(key, call);
  return call;
}

export type AagPartPriceLoad =
  | { enabled: false }
  | { enabled: true; byGenart: Map<number, AagPartOffers> };

/**
 * AAG's parts for each part group on a registration: stored answers where
 * fresh, AAG asked in parallel for the rest. `enabled: false` while migration
 * 0070 is missing. Never throws.
 */
export async function loadAagPartOffers(
  db: SupabaseClient,
  reg: string,
  genartIds: readonly number[],
  options: {
    fetch?: (regKey: string, genartId: number) => Promise<AagFetchOutcome>;
    now?: number;
    /** Per NAPA call. Customers' quotes keep the 4 s default; the admin's model scans wait longer. */
    timeoutMs?: number;
  } = {},
): Promise<AagPartPriceLoad> {
  const regKey = aagRegKey(reg);
  const byGenart = new Map<number, AagPartOffers>();
  const ids = [...new Set(genartIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (!regKey || ids.length === 0) return { enabled: true, byGenart };

  let rows = new Map<number, AagPartPriceRow>();
  try {
    const { data, error } = await db
      .from(TABLE)
      .select("reg, genart_id, state, offers, fetched_at")
      .eq("reg", regKey)
      .in("genart_id", ids);
    if (error && isMissingTable(error)) return { enabled: false };
    if (!error) rows = new Map(((data ?? []) as AagPartPriceRow[]).map((r) => [r.genart_id, r]));
  } catch {
    // No stored answers: ask AAG for everything.
  }

  const now = options.now ?? Date.now();
  // One car, so one set of engine codes shared by every part group asked, and
  // the approved code mappings for these groups (Task 77). Only read when
  // NAPA is going to be asked.
  const timeoutMs = options.timeoutMs ?? AAG_CUSTOMER_TIMEOUT_MS;
  const engineCodes = engineCodeSource(regKey, { db, timeoutMs });
  const needAsking = ids.some((id) => !freshAnswer(rows.get(id) ?? null, now));
  const codeMaps = needAsking && !options.fetch ? await loadApprovedCodeMaps(db, ids) : new Map<number, number>();
  const fetchOne =
    options.fetch ??
    ((key: string, genartId: number) =>
      sharedFetch(key, genartId, () => fetchFromAag(key, genartId, engineCodes, codeMaps.get(genartId), timeoutMs)));
  const writes: AagPartPriceRow[] = [];
  await Promise.all(
    ids.map(async (genartId) => {
      const row = rows.get(genartId) ?? null;
      const fresh = freshAnswer(row, now);
      if (fresh) {
        byGenart.set(genartId, fresh);
        return;
      }
      let outcome: AagFetchOutcome;
      try {
        outcome = await fetchOne(regKey, genartId);
      } catch {
        outcome = { kind: "failed" };
      }
      const settled = settleAagPartOffers(row, outcome, { reg: regKey, genartId, now });
      byGenart.set(genartId, settled.result);
      if (settled.write) writes.push(settled.write);
    }),
  );

  if (writes.length > 0) {
    try {
      await db.from(TABLE).upsert(writes, { onConflict: "reg,genart_id" });
    } catch {
      // A cache that can't be written just asks AAG again next time.
    }
  }
  return { enabled: true, byGenart };
}
