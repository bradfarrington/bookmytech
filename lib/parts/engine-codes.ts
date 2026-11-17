// The engine codes NAPA uses for a car (Task 77).
//
// NAPA's full catalogue (/api/quote/classic) lists some parts for one engine
// only: "TecDoc Engine Number: BF2X". Such a part fits when BF2X is the car's
// own engine, and NAPA says what that is in its exact-match answer
// (/api/quote): every article there carries an "Engine Code" property. So a
// catalogue part is matched on NAPA's data checked against NAPA's data, never
// on HaynesPro's naming or ours.
//
// A car can have more than one code: the same engine under two naming schemes
// (a 2010 Fiesta is C14HDEZ on its filters and SPJC on its pads, live
// 2026-11-17). Every code an exact-match answer has given for the
// registration is kept in `aag_engine_codes` (migration 0090), and a
// catalogue part fits when its engine number is among them.
//
// Codes are learnt from every standard quote that comes back with parts. When
// a catalogue part needs one and none is known yet, NAPA is asked for the oil
// and air filters (7, 8), which carried the code on every car tried that has
// an engine code at all (a Tesla has none, so its engine-limited parts stay
// unpriced, as before). Read-only lookups only. Never throws.

import type { SupabaseClient } from "@supabase/supabase-js";

import { aagQuoteResult, aagRegKey } from "@/lib/aag/client";
import { engineCodesOf } from "@/lib/aag/quote";
import { isMissingTable } from "./part-group-settings";

const TABLE = "aag_engine_codes";

/** Part groups asked to learn a car's engine codes: oil filter, air filter. */
export const ENGINE_CODE_PROBE_GENARTS: readonly number[] = [7, 8];

export interface EngineCodeSource {
  /** The car's engine codes, asking NAPA once if none are known. Empty when NAPA gives none. */
  get(): Promise<string[]>;
  /** Codes read from one of NAPA's exact-match answers for this car. */
  seen(codes: readonly string[]): void;
}

export interface EngineCodeOptions {
  /** Where codes are kept between requests. Without one, they last for this source only. */
  db?: SupabaseClient | null;
  timeoutMs?: number;
  /** The standard quote, injectable for tests. */
  quote?: typeof aagQuoteResult;
}

/** A source whose pending write can be awaited (tests, scripts). */
export interface SettlingEngineCodeSource extends EngineCodeSource {
  /** Resolves once every code seen so far has been written, or failed to be. */
  settled(): Promise<void>;
}

/** One car's engine codes for the length of a request: one read, one probe at most. */
export function engineCodeSource(reg: string, options: EngineCodeOptions = {}): SettlingEngineCodeSource {
  const regKey = aagRegKey(reg);
  const db = options.db ?? null;
  const quote = options.quote ?? aagQuoteResult;
  const known = new Set<string>();
  let tableMissing = false;
  let stored: Promise<Set<string>> | null = null;
  let probe: Promise<string[]> | null = null;
  let writes: Promise<void> = Promise.resolve();

  const loadStored = (): Promise<Set<string>> => {
    stored ??= (async () => {
      if (!db || !regKey) return new Set<string>();
      try {
        const { data, error } = await db.from(TABLE).select("codes").eq("reg", regKey).maybeSingle();
        if (error) {
          if (isMissingTable(error)) tableMissing = true;
          return new Set<string>();
        }
        const codes = (data as { codes?: unknown } | null)?.codes;
        return new Set(Array.isArray(codes) ? codes.filter((c): c is string => typeof c === "string") : []);
      } catch {
        return new Set<string>();
      }
    })();
    return stored;
  };

  // One write at a time, each carrying everything known by then, so a slow
  // early write can never land after a later one with fewer codes.
  const persist = () => {
    writes = writes.then(async () => {
      if (!db || !regKey) return;
      const already = await loadStored();
      if (tableMissing) return;
      const codes = new Set([...already, ...known]);
      if (codes.size === already.size) return;
      try {
        const { error } = await db
          .from(TABLE)
          .upsert({ reg: regKey, codes: [...codes].sort(), seen_at: new Date().toISOString() }, { onConflict: "reg" });
        if (!error) stored = Promise.resolve(codes);
      } catch {
        // Not kept: learnt again next time.
      }
    });
  };

  const seen = (codes: readonly string[]) => {
    const before = known.size;
    for (const code of codes) known.add(code);
    if (known.size > before) persist();
  };

  const get = async (): Promise<string[]> => {
    const fromDb = await loadStored();
    for (const code of fromDb) known.add(code);
    if (known.size > 0) return [...known].sort();
    probe ??= (async () => {
      const answers = await Promise.all(
        ENGINE_CODE_PROBE_GENARTS.map((genart) =>
          quote(regKey, genart, { timeoutMs: options.timeoutMs }).catch(() => ({ kind: "failed" as const, reason: "" })),
        ),
      );
      const codes = answers.flatMap((answer) => (answer.kind === "ok" ? engineCodesOf(answer.body) : []));
      seen(codes);
      return [...known].sort();
    })();
    return probe;
  };

  return { get, seen, settled: () => writes };
}
