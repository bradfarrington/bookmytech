// Alliance Automotive's parts for one part group on one registration, cached
// for customer quotes (Task 43).
//
// A quote is recalculated at every funnel step (Price, Time, Address, Confirm,
// the card hold, the booking), so AAG's answer is kept per registration and
// part group in `aag_part_prices` (migration 0070):
//   - under 12 hours old, it is used as it is, so every step, the hold and the
//     booking see one price;
//   - older, AAG is asked again, with a short timeout so a slow supplier can't
//     stall the funnel;
//   - when AAG can't answer, its last answer is used if at most 7 days old
//     (owner decision, 2026-09-15); otherwise the part can't be priced.
//
// Offers are cached, never the selection, so an admin's part choice takes
// effect at once while the price holds.

import type { SupabaseClient } from "@supabase/supabase-js";

import { aagQuoteResult, aagRegKey } from "@/lib/aag/client";
import { flattenQuote } from "@/lib/aag/quote";
import { isMissingTable } from "./part-group-settings";
import { aagOffers, type SupplierOffer } from "./supplier-offer";

export const AAG_PRICE_FRESH_MS = 12 * 60 * 60 * 1000;
export const AAG_PRICE_LAST_KNOWN_MS = 7 * 24 * 60 * 60 * 1000;
/** Per AAG call on the customer path. The admin pages keep the client's default. */
export const AAG_CUSTOMER_TIMEOUT_MS = 4_000;

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

/** A stored answer young enough to use without asking AAG. Pure. */
export function freshAnswer(row: AagPartPriceRow | null, now: number): AagPartOffers | null {
  if (!row || ageMs(row.fetched_at, now) >= AAG_PRICE_FRESH_MS) return null;
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

async function fetchFromAag(regKey: string, genartId: number): Promise<AagFetchOutcome> {
  const outcome = await aagQuoteResult(regKey, genartId, { timeoutMs: AAG_CUSTOMER_TIMEOUT_MS });
  if (outcome.kind !== "ok") return outcome;
  const offers = aagOffers(flattenQuote(outcome.body));
  return offers.length > 0 ? { kind: "ok", offers } : { kind: "no_parts" };
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
  options: { fetch?: (regKey: string, genartId: number) => Promise<AagFetchOutcome>; now?: number } = {},
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
  const fetchOne = options.fetch ?? fetchFromAag;
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
