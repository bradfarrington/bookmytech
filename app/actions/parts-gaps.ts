"use server";

// The admin Parts gaps screen's actions (Task 77): approve the code mappings
// we propose, and pick a NAPA part for a model where NAPA lists nothing for it.
//
// Admin-only on every call: these return trade prices. READ-ONLY against
// NAPA: only /api/product/info is asked, to check a part number and price it.
// Nothing orders.

import { revalidatePath } from "next/cache";

import { aagProductInfo } from "@/lib/aag/client";
import { requireAdmin } from "@/lib/auth/require-admin";
import { discoverCodeMatches } from "@/lib/parts/code-match-discovery";
import { loadScan, priceScan, scanModel } from "@/lib/parts/model-scan";
import { isMissingTable } from "@/lib/parts/part-group-settings";
import { PARTS_GAPS_SCREEN_ENABLED } from "@/lib/parts/parts-gaps-flag";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE = "/admin/parts/gaps";
const NOT_SET_UP = "Parts gaps aren't set up yet. Apply migration 0090 first.";
/** The screen is local-only for now (lib/parts/parts-gaps-flag.ts); so are its actions. */
const OFF = "Parts gaps isn't switched on here.";

export type PartsGapActionResult = { ok: true } | { ok: false; error: string };

function positiveInt(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function failure(error: { code?: string; message: string }): { ok: false; error: string } {
  return { ok: false, error: isMissingTable(error) ? NOT_SET_UP : `Couldn't save that: ${error.message}` };
}

// --- Code mappings ------------------------------------------------------------

/**
 * Approve, reject or reopen a proposed mapping. Approving clears NAPA's
 * stored "no parts" answers for the part type, so customers' next quote asks
 * again under both codes instead of waiting up to 12 hours.
 */
export async function decideCodeMapAction(input: {
  genartId: number;
  decision: "approved" | "rejected" | "proposed";
}): Promise<PartsGapActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!PARTS_GAPS_SCREEN_ENABLED) return { ok: false, error: OFF };
  const genartId = positiveInt(input.genartId);
  if (!genartId) return { ok: false, error: "That part type couldn't be found." };
  if (!["approved", "rejected", "proposed"].includes(input.decision)) {
    return { ok: false, error: "That isn't a decision this screen knows." };
  }

  const db = createAdminClient();
  const reopened = input.decision === "proposed";
  const { data, error } = await db
    .from("part_code_maps")
    .update({
      status: input.decision,
      decided_by: reopened ? null : gate.userId,
      decided_at: reopened ? null : new Date().toISOString(),
    })
    .eq("genart_id", genartId)
    .select("genart_id");
  if (error) return failure(error);
  if (!data?.length) return { ok: false, error: "That mapping couldn't be found." };

  if (input.decision === "approved") {
    await db.from("aag_part_prices").delete().eq("genart_id", genartId).eq("state", "empty");
  }
  revalidatePath(PAGE);
  return { ok: true };
}

// --- Scanning a model ----------------------------------------------------------

export type ScanActionResult =
  | { ok: true; make: string; modelLabel: string; message: string }
  | { ok: false; error: string };

/**
 * Scan a model through one registration: HaynesPro's whole repair list (about
 * 12-20 metered calls) and NAPA's answer for every part type (read-only).
 * Takes a minute or two.
 */
export async function scanModelAction(input: { reg: string }): Promise<ScanActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!PARTS_GAPS_SCREEN_ENABLED) return { ok: false, error: OFF };
  const reg = String(input.reg ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (reg.length < 2 || reg.length > 8) return { ok: false, error: "Enter a registration." };
  const result = await scanModel(createAdminClient(), reg, gate.userId);
  if (!result.ok) return result;
  revalidatePath(PAGE);
  return {
    ok: true,
    make: result.scan.make_name,
    modelLabel: result.scan.model_label,
    message: `${result.scan.model_label}: ${result.scan.repairs.length} repairs need parts; NAPA priced ${result.priced} of ${result.partTypes} part types.`,
  };
}

/** Ask NAPA again for every part type on a scanned model (read-only), e.g. after approving code matches. */
export async function recheckModelAction(input: { make: string; modelLabel: string }): Promise<PartsGapActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!PARTS_GAPS_SCREEN_ENABLED) return { ok: false, error: OFF };
  const db = createAdminClient();
  const scan = await loadScan(db, String(input.make ?? ""), String(input.modelLabel ?? ""));
  if (!scan) return { ok: false, error: "Scan that model first." };
  await priceScan(db, scan);
  revalidatePath(PAGE);
  return { ok: true };
}

export type FindMatchesResult = { ok: true; message: string } | { ok: false; error: string };

/** Look across every scanned model for codes NAPA stocks a part under, and propose them. */
export async function findCodeMatchesAction(): Promise<FindMatchesResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!PARTS_GAPS_SCREEN_ENABLED) return { ok: false, error: OFF };
  const result = await discoverCodeMatches(createAdminClient());
  if (!result.ok) return result;
  revalidatePath(PAGE);
  return {
    ok: true,
    message:
      result.proposed === 0
        ? `No new code matches across ${result.scans} scanned models.`
        : `${result.proposed} new code match${result.proposed === 1 ? "" : "es"} to review, from ${result.scans} scanned models.`,
  };
}

// --- Picking a part for a model -----------------------------------------------

export interface PartLookup {
  partNumber: string;
  brand: string | null;
  description: string | null;
  rating: string | null;
  costPence: number | null;
  quantity: number | null;
  /** The part-type codes NAPA files it under. */
  groups: string[];
  /** Whether NAPA files it under this part type (or its approved NAPA code). */
  sameType: boolean;
}

export type PartLookupResult = { ok: true; part: PartLookup } | { ok: false; error: string };

/** Ask NAPA about a part number (read-only), to check it before it's picked. */
export async function lookupPartNumberAction(input: { partNumber: string; genartId: number }): Promise<PartLookupResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!PARTS_GAPS_SCREEN_ENABLED) return { ok: false, error: OFF };
  const partNumber = String(input.partNumber ?? "").trim().toUpperCase();
  const genartId = positiveInt(input.genartId);
  if (!partNumber) return { ok: false, error: "Enter a NAPA part number." };
  if (!genartId) return { ok: false, error: "That part type couldn't be found." };
  return lookupPart(partNumber, genartId);
}

async function lookupPart(partNumber: string, genartId: number): Promise<PartLookupResult> {
  const body = await aagProductInfo([partNumber]).catch(() => null);
  if (!body) return { ok: false, error: "NAPA Auto Parts didn't answer. Try again in a minute." };
  const info = (body.Products ?? []).find((p) => p.ProductId?.trim().toUpperCase() === partNumber);
  if (!info) return { ok: false, error: `NAPA Auto Parts doesn't know part number ${partNumber}.` };

  const { data: map } = await createAdminClient()
    .from("part_code_maps")
    .select("napa_genart_id")
    .eq("genart_id", genartId)
    .eq("status", "approved")
    .maybeSingle();
  const codes = new Set([String(genartId), ...(map ? [String((map as { napa_genart_id: number }).napa_genart_id)] : [])]);
  const groups = (info.CustomerProductGroup ?? []).map((g) => String(g).trim()).filter(Boolean);
  const costPence = typeof info.CostPrice === "number" ? Math.round(info.CostPrice * 100) : null;
  return {
    ok: true,
    part: {
      partNumber: info.ProductId?.trim() || partNumber,
      brand: info.Brand?.trim() || null,
      description: info.ProductDescription?.trim() || null,
      rating: info.BrandRating?.trim() || null,
      costPence,
      quantity: typeof info.RecMinOrdQty === "number" ? info.RecMinOrdQty : null,
      groups,
      sameType: groups.some((g) => codes.has(g)),
    },
  };
}

/**
 * Use this NAPA part for a model and part type (optionally one axle), for
 * every customer with that model, whenever NAPA lists nothing for the car.
 * The part number is checked with NAPA first; a part NAPA files under another
 * part type is refused, so a gap can't be filled with the wrong kind of part.
 */
export async function chooseModelPartAction(input: {
  make: string;
  modelLabel: string;
  genartId: number;
  label: string | null;
  position: "front" | "rear" | null;
  partNumber: string;
}): Promise<PartsGapActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!PARTS_GAPS_SCREEN_ENABLED) return { ok: false, error: OFF };
  const make = String(input.make ?? "").trim();
  const modelLabel = String(input.modelLabel ?? "").trim();
  const genartId = positiveInt(input.genartId);
  const position = input.position === "front" || input.position === "rear" ? input.position : null;
  const partNumber = String(input.partNumber ?? "").trim().toUpperCase();
  if (!make || !modelLabel || !genartId) return { ok: false, error: "That gap couldn't be found." };
  if (!partNumber) return { ok: false, error: "Pick a part or enter a NAPA part number." };

  const looked = await lookupPart(partNumber, genartId);
  if (!looked.ok) return looked;
  if (!looked.part.sameType) {
    return {
      ok: false,
      error: `NAPA files ${looked.part.partNumber} under another part type (${looked.part.groups.join(", ") || "none"}), not this one.`,
    };
  }

  const db = createAdminClient();
  let clear = db
    .from("model_part_choices")
    .delete()
    .eq("make_name", make)
    .eq("model_label", modelLabel)
    .eq("genart_id", genartId);
  clear = position ? clear.eq("position", position) : clear.is("position", null);
  const cleared = await clear;
  if (cleared.error) return failure(cleared.error);

  const { error } = await db.from("model_part_choices").insert({
    make_name: make,
    model_label: modelLabel,
    genart_id: genartId,
    position,
    product_id: looked.part.partNumber,
    label: input.label?.trim() || null,
    brand: looked.part.brand,
    description: looked.part.description,
    chosen_by: gate.userId,
    chosen_at: new Date().toISOString(),
  });
  if (error) return failure(error);
  revalidatePath(PAGE);
  return { ok: true };
}

/** Stop using a picked part. The part type is unpriced again for that model. */
export async function removeModelPartAction(input: { id: string }): Promise<PartsGapActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  if (!PARTS_GAPS_SCREEN_ENABLED) return { ok: false, error: OFF };
  const id = String(input.id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "That pick couldn't be found." };
  const { error } = await createAdminClient().from("model_part_choices").delete().eq("id", id);
  if (error) return failure(error);
  revalidatePath(PAGE);
  return { ok: true };
}
