// NAPA's parts for one part group on one registration, asked live (Task 76).
//
// The standard quote (/api/quote) comes first: NAPA has matched its answer to
// the exact car and offers one part per rating. When it has nothing, or fails,
// the full catalogue (/api/quote/classic) is asked instead. Each finds parts
// the other misses (2026-11-17, live: a 2024 Ranger priced 27 part groups on
// the standard quote, 34 on classic, 42 with both; a 2010 Fiesta's parts
// repairs went from 23% to 30% fully priced, exact matches only).
//
// The standard quote is NAPA's exact match for the car. Classic lists the
// model's whole range, so only its unambiguous answers are used: the parts on
// the job's axle, when none has a vehicle condition attached, or only engine
// codes that include the car's own as NAPA reports it (Task 77,
// engine-codes.ts) (unambiguousClassic). Where NAPA's own data limits a part to some versions
// ("for vehicles with rear discs", engine codes, trim levels), nothing is
// guessed: the part
// group stays unpriced and falls through to estimates as before. Classic
// parts carry `fromCatalogue` as a record of where they came from.
//
// Both the customer price cache (aag-part-prices.ts) and the admin Parts
// panel (supplier-lookup.ts) ask through here, so they always agree.
// Read-only: only the two quote lookups are ever sent. Never throws.

import { aagQuoteClassicResult, aagQuoteResult } from "@/lib/aag/client";
import {
  classicNeedsEngineCode,
  classicToQuoteBody,
  engineCodesOf,
  flattenQuote,
  unambiguousClassic,
} from "@/lib/aag/quote";
import type { EngineCodeSource } from "./engine-codes";
import { aagOffers, type SupplierOffer } from "./supplier-offer";

export type AagLiveOffers =
  | { kind: "ok"; offers: SupplierOffer[]; from: "quote" | "classic" }
  /** NAPA answered that nothing in this part group fits the vehicle. */
  | { kind: "no_parts" }
  /** NAPA couldn't answer. `reason` is for the admin pages, never a customer. */
  | { kind: "failed"; reason: string };

export interface AagLiveOptions {
  timeoutMs?: number;
  includeVehicleDetails?: boolean;
  /**
   * The car's engine codes (Task 77): learnt from each exact-match answer, and
   * asked for when a catalogue part is limited to engine codes. Without it,
   * such parts are never priced, as before Task 77.
   */
  engineCodes?: EngineCodeSource;
  /**
   * The code NAPA stocks this part type under, when an admin approved a
   * mapping (Task 77, code-maps.ts). Asked alongside the HaynesPro code; its
   * answer is used only when the HaynesPro code has no parts.
   */
  napaGenart?: number | null;
}

/** The two lookups, injectable for tests. */
export interface AagLookups {
  quote: typeof aagQuoteResult;
  classic: typeof aagQuoteClassicResult;
}

const LIVE: AagLookups = { quote: aagQuoteResult, classic: aagQuoteClassicResult };

export async function fetchAagLiveOffers(
  reg: string,
  genart: string | number,
  options: AagLiveOptions = {},
  lookups: AagLookups = LIVE,
): Promise<AagLiveOffers> {
  const { napaGenart, ...rest } = options;
  if (!napaGenart || String(napaGenart) === String(genart)) return fetchOneCode(reg, genart, rest, lookups);

  // An approved mapping: both codes at once, so a mapped part type costs no
  // extra time. HaynesPro's own code wins whenever it has parts.
  const [own, mapped] = await Promise.all([
    fetchOneCode(reg, genart, rest, lookups),
    fetchOneCode(reg, napaGenart, rest, lookups),
  ]);
  if (own.kind === "ok") return own;
  if (mapped.kind === "ok") {
    return { ...mapped, offers: mapped.offers.map((offer) => ({ ...offer, napaGenart: Number(napaGenart) })) };
  }
  if (own.kind === "no_parts" || mapped.kind === "no_parts") return { kind: "no_parts" };
  return own;
}

/** One part-type code: the standard quote, then the full catalogue. */
async function fetchOneCode(
  reg: string,
  genart: string | number,
  options: Omit<AagLiveOptions, "napaGenart">,
  lookups: AagLookups,
): Promise<AagLiveOffers> {
  const { engineCodes, ...callOptions } = options;
  const standard = await safely(() => lookups.quote(reg, genart, callOptions));
  if (standard.kind === "ok") {
    engineCodes?.seen(engineCodesOf(standard.body));
    const offers = aagOffers(flattenQuote(standard.body));
    if (offers.length > 0) return { kind: "ok", offers, from: "quote" };
  }

  const classic = await safely(() => lookups.classic(reg, genart, { ...callOptions, includeVehicleDetails: false }));
  if (classic.kind === "ok") {
    const carEngineCodes =
      engineCodes && classicNeedsEngineCode(classic.body) ? await engineCodes.get().catch(() => []) : [];
    const fitting = unambiguousClassic(classic.body, carEngineCodes);
    const offers = aagOffers(flattenQuote(classicToQuoteBody(fitting))).map((offer) => ({
      ...offer,
      fromCatalogue: true,
    }));
    if (offers.length > 0) return { kind: "ok", offers, from: "classic" };
  }

  // Neither had a usable part. "No parts" when either answered: the standard
  // quote with nothing, or classic with nothing or only variants we won't
  // guess between. Otherwise a failure, so the price cache keeps its last
  // known answer. Classic's ISE0047 is ambiguous (it also means "nothing"),
  // so it never turns the standard quote's failure into "no parts" on its own.
  if (standard.kind !== "failed" || classic.kind !== "failed") return { kind: "no_parts" };
  return { kind: "failed", reason: standard.kind === "failed" ? standard.reason : "NAPA Auto Parts didn't answer." };
}

async function safely<T extends { kind: string }>(call: () => Promise<T>): Promise<T | { kind: "failed"; reason: string }> {
  try {
    return await call();
  } catch (error) {
    return { kind: "failed", reason: error instanceof Error ? error.message : String(error) };
  }
}
