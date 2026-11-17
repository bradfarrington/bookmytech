// Parts an admin could pick for a gap (Task 77): what NAPA has priced under
// the same part type on other cars, from the answers already stored in
// `aag_part_prices`. A starting point for Gareth's choice, never a match: NAPA
// hasn't said any of them fits the model, so he decides. Costs one read, no
// NAPA calls.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PartPosition, SupplierOffer } from "./supplier-offer";

/** A NAPA part an admin could pick for a gap. */
export interface PartCandidate {
  partNumber: string;
  brand: string | null;
  description: string | null;
  rating: string | null;
  /** Trade price per unit, pence, as last priced. */
  costPence: number | null;
  quantity: number | null;
  position: PartPosition | null;
  /** NAPA's picture of the part, when it sent one. */
  imageUrl: string | null;
  /** The models NAPA priced it on, e.g. "FORD Fiesta Mk VI". */
  seenOn: string[];
  /** Priced on a car of the same make. Listed first. */
  sameMake: boolean;
}

/** Most candidates kept per part type. */
const PER_TYPE = 40;
/** Stored answers read, newest first. */
const ROWS = 4000;

interface Row {
  reg: string;
  genart_id: number;
  offers: SupplierOffer[];
}

/** Candidates per part type from stored answers on other cars. Pure. */
export function candidatesFrom(
  rows: readonly Row[],
  cars: ReadonlyMap<string, { make: string; model: string }>,
  make: string,
  excludeModel: string | null,
): Map<number, PartCandidate[]> {
  const byType = new Map<number, Map<string, PartCandidate>>();
  const wantMake = make.trim().toUpperCase();
  for (const row of rows) {
    const car = cars.get(row.reg);
    if (excludeModel && car?.model === excludeModel) continue;
    const seenOn = car?.model || row.reg;
    const sameMake = !!car && car.make.trim().toUpperCase() === wantMake;
    const parts = byType.get(row.genart_id) ?? new Map<string, PartCandidate>();
    for (const offer of row.offers ?? []) {
      if (!offer.partNumber || !offer.buyable) continue;
      const existing = parts.get(offer.partNumber);
      if (existing) {
        if (!existing.seenOn.includes(seenOn)) existing.seenOn.push(seenOn);
        existing.sameMake ||= sameMake;
        existing.imageUrl ??= offer.imageUrl ?? null;
        continue;
      }
      parts.set(offer.partNumber, {
        partNumber: offer.partNumber,
        brand: offer.brand,
        description: offer.description,
        rating: offer.tier,
        costPence: offer.costPence,
        quantity: offer.quantityOfFit,
        position: offer.position,
        imageUrl: offer.imageUrl ?? null,
        seenOn: [seenOn],
        sameMake,
      });
    }
    byType.set(row.genart_id, parts);
  }
  const out = new Map<number, PartCandidate[]>();
  for (const [genartId, parts] of byType) {
    out.set(
      genartId,
      [...parts.values()]
        .sort((a, b) => Number(b.sameMake) - Number(a.sameMake) || b.seenOn.length - a.seenOn.length)
        .slice(0, PER_TYPE),
    );
  }
  return out;
}

/** Candidates for these part types, same make first. Never throws. */
export async function loadPartCandidates(
  db: SupabaseClient,
  genartIds: readonly number[],
  make: string,
  excludeModel: string | null = null,
): Promise<Map<number, PartCandidate[]>> {
  const ids = [...new Set(genartIds)];
  if (ids.length === 0) return new Map();
  try {
    const { data } = await db
      .from("aag_part_prices")
      .select("reg, genart_id, offers")
      .in("genart_id", ids)
      .eq("state", "ok")
      .order("fetched_at", { ascending: false })
      .limit(ROWS);
    const rows = (data ?? []) as Row[];
    const regs = [...new Set(rows.map((r) => r.reg))];
    const cars = new Map<string, { make: string; model: string }>();
    if (regs.length > 0) {
      const { data: found } = await db.from("haynespro_vehicle_cache").select("reg, hp_make, hp_model_label").in("reg", regs);
      for (const car of (found ?? []) as Array<{ reg: string; hp_make: string | null; hp_model_label: string | null }>) {
        cars.set(car.reg, { make: car.hp_make ?? "", model: car.hp_model_label ?? car.reg });
      }
    }
    return candidatesFrom(rows, cars, make, excludeModel);
  } catch {
    return new Map();
  }
}
