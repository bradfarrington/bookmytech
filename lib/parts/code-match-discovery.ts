// Finding the code NAPA stocks a part under (Task 77).
//
// TecDoc has more than one part-type code for some parts, and HaynesPro and
// NAPA don't always use the same one (brake fluid: 71 and 3357). HaynesPro
// names every code it uses, so across the models we've scanned
// (model_part_scans) a name used under two codes shows the pair. When NAPA
// has nothing for one code on every scanned car but prices the other, that's
// proposed as a mapping, with the evidence, for Gareth to approve.
//
// Only IDENTICAL names pair up (case and spacing aside), never similar wording
// (Brad, 2026-11-17): "Tie rod" and "Tie rod end" are different parts.
// The more models are scanned, the more pairs it can see.

import type { SupabaseClient } from "@supabase/supabase-js";

import { normaliseLabel } from "@/lib/haynespro/exclusions";
import { aagRegKey } from "@/lib/aag/client";
import { fetchAagLiveOffers } from "./aag-live-offers";
import { engineCodeSource } from "./engine-codes";
import type { ScannedRepair } from "./model-scan";
import type { SupplierOffer } from "./supplier-offer";

export interface ScanForDiscovery {
  reg: string;
  modelLabel: string;
  repairs: ReadonlyArray<Pick<ScannedRepair, "groups">>;
}

export interface StoredAnswer {
  reg: string;
  genartId: number;
  state: "ok" | "empty";
  offers: SupplierOffer[];
}

export interface CodeMatchProposal {
  genartId: number;
  napaGenartId: number;
  label: string;
  evidence: {
    /** A car NAPA priced the other code on. */
    reg: string;
    model: string;
    parts: number;
    sample: string | null;
    /** Scanned cars NAPA priced the other code on, of those it was asked about. */
    pricedOn: number;
    /** Scanned cars where NAPA had nothing for this code. */
    emptyOn: number;
    /** Repairs on scanned models that need this code. */
    repairs: number;
  };
}

function sampleOf(offers: readonly SupplierOffer[]): string | null {
  const offer = offers.find((o) => o.buyable) ?? offers[0];
  return offer ? [offer.brand, offer.partNumber, offer.description].filter(Boolean).join(" ") : null;
}

/**
 * The mappings worth proposing. A code qualifies when NAPA answered "no
 * parts" for it on every scanned car it was asked about, and another code
 * with the identical HaynesPro name was priced on at least one. Codes already
 * mapped (any status) are skipped. Pure.
 */
export function proposeCodeMatches(args: {
  scans: readonly ScanForDiscovery[];
  answers: readonly StoredAnswer[];
  existing: ReadonlySet<number>;
}): CodeMatchProposal[] {
  const labels = new Map<number, string>();
  const repairsUsing = new Map<number, number>();
  for (const scan of args.scans) {
    for (const repair of scan.repairs) {
      for (const group of repair.groups) {
        if (!labels.has(group.genartId)) labels.set(group.genartId, group.label);
        repairsUsing.set(group.genartId, (repairsUsing.get(group.genartId) ?? 0) + 1);
      }
    }
  }
  const byName = new Map<string, number[]>();
  for (const [id, label] of labels) {
    const key = normaliseLabel(label);
    if (!key) continue;
    byName.set(key, [...(byName.get(key) ?? []), id]);
  }

  const modelOf = new Map(args.scans.map((s) => [aagRegKey(s.reg), s.modelLabel]));
  const ok = new Map<number, StoredAnswer[]>();
  const empty = new Map<number, number>();
  for (const answer of args.answers) {
    if (answer.state === "ok" && answer.offers.some((o) => o.buyable)) {
      ok.set(answer.genartId, [...(ok.get(answer.genartId) ?? []), answer]);
    } else if (answer.state === "empty") {
      empty.set(answer.genartId, (empty.get(answer.genartId) ?? 0) + 1);
    }
  }

  const proposals: CodeMatchProposal[] = [];
  for (const [id, label] of labels) {
    if (args.existing.has(id) || ok.has(id) || !empty.has(id)) continue;
    const others = (byName.get(normaliseLabel(label)) ?? []).filter((other) => other !== id && ok.has(other));
    if (others.length === 0) continue;
    const best = others.sort((a, b) => ok.get(b)!.length - ok.get(a)!.length)[0];
    const priced = ok.get(best)!;
    const example = priced[0];
    proposals.push({
      genartId: id,
      napaGenartId: best,
      label,
      evidence: {
        reg: example.reg,
        model: modelOf.get(aagRegKey(example.reg)) ?? example.reg,
        parts: example.offers.filter((o) => o.buyable).length,
        sample: sampleOf(example.offers),
        pricedOn: priced.length,
        emptyOn: empty.get(id) ?? 0,
        repairs: repairsUsing.get(id) ?? 0,
      },
    });
  }
  return proposals.sort((a, b) => b.evidence.repairs - a.evidence.repairs);
}

export type DiscoveryResult =
  | { ok: true; proposed: number; checkedOnGapCar: number; scans: number }
  | { ok: false; error: string };

/**
 * Propose mappings from every scanned model, check each against a car that
 * needs it (read-only), and save them as `proposed`. Never throws.
 */
export async function discoverCodeMatches(db: SupabaseClient): Promise<DiscoveryResult> {
  const { data: scanRows, error } = await db.from("model_part_scans").select("reg, model_label, repairs");
  if (error) return { ok: false, error: `Couldn't read the scanned models: ${error.message}` };
  const scans = ((scanRows ?? []) as Array<{ reg: string; model_label: string; repairs: ScannedRepair[] }>).map((s) => ({
    reg: s.reg,
    modelLabel: s.model_label,
    repairs: s.repairs ?? [],
  }));
  if (scans.length === 0) return { ok: false, error: "Scan at least one model first." };

  const regs = scans.map((s) => aagRegKey(s.reg));
  const answers: StoredAnswer[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db
      .from("aag_part_prices")
      .select("reg, genart_id, state, offers")
      .in("reg", regs)
      .order("genart_id")
      .range(from, from + 999);
    const page = (data ?? []) as Array<{ reg: string; genart_id: number; state: "ok" | "empty"; offers: SupplierOffer[] }>;
    answers.push(...page.map((r) => ({ reg: r.reg, genartId: r.genart_id, state: r.state, offers: r.offers ?? [] })));
    if (page.length < 1000) break;
  }
  const { data: mapped } = await db.from("part_code_maps").select("genart_id");
  const existing = new Set(((mapped ?? []) as Array<{ genart_id: number }>).map((m) => m.genart_id));

  const proposals = proposeCodeMatches({ scans, answers, existing });

  // Would it price on a car that needs it? Asked live, read-only, so Gareth
  // sees the answer for the car rather than for some other model.
  let checkedOnGapCar = 0;
  const rows = [];
  for (const proposal of proposals) {
    const gapReg = answers.find((a) => a.genartId === proposal.genartId && a.state === "empty")?.reg ?? null;
    let onGapCar: number | null = null;
    if (gapReg) {
      const live = await fetchAagLiveOffers(gapReg, proposal.napaGenartId, {
        engineCodes: engineCodeSource(gapReg, { db }),
      });
      onGapCar = live.kind === "ok" ? live.offers.filter((o) => o.buyable).length : live.kind === "no_parts" ? 0 : null;
      checkedOnGapCar++;
    }
    rows.push({
      genart_id: proposal.genartId,
      napa_genart_id: proposal.napaGenartId,
      label: proposal.label,
      napa_label: proposal.label,
      status: "proposed",
      evidence: { ...proposal.evidence, gapReg, onGapCar },
    });
  }
  if (rows.length > 0) {
    const { error: saveError } = await db.from("part_code_maps").upsert(rows, { onConflict: "genart_id", ignoreDuplicates: true });
    if (saveError) return { ok: false, error: `Couldn't save the proposals: ${saveError.message}` };
  }
  return { ok: true, proposed: rows.length, checkedOnGapCar, scans: scans.length };
}
