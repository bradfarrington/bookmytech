"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/require-admin";
import { readAdsUsage } from "@/lib/lkq/ads-cache";
import { componentByNumber } from "@/lib/lkq/components";
import { adsRegKey } from "@/lib/lkq/vehicle";
import type { ExamplesPanel } from "@/lib/parts/part-examples";
import { suggestComponents } from "@/lib/parts/part-group-match";
import { lkqComponentExamples, lkqFittingComponents } from "@/lib/parts/part-group-evidence";
import { createAdminClient } from "@/lib/supabase/admin";

// The admin's decisions on which LKQ component each TecDoc part group means
// (Task 45). One decision per part group applies to every vehicle. Writes go
// through the service-role client after an explicit admin check.
//
// The decisions themselves call no supplier. The two loaders at the bottom do:
// they show LKQ's real parts on a real car so a match isn't a guess from two
// names, and they spend metered LKQ credits (cached).

export type PartGroupActionResult = { ok: true } | { ok: false; error: string };

const TABLE = "part_group_links";

function genartIdOf(raw: unknown): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function revalidate() {
  revalidatePath("/admin/parts/groups");
}

async function update(
  genartId: number,
  values: Record<string, unknown>,
): Promise<PartGroupActionResult> {
  const now = new Date().toISOString();
  const { error, count } = await createAdminClient()
    .from(TABLE)
    .update({ ...values, updated_at: now }, { count: "exact" })
    .eq("genart_id", genartId);
  if (error) return { ok: false, error: `Couldn't save that: ${error.message}` };
  if (count === 0) return { ok: false, error: "That part group isn't in the list any more." };
  revalidate();
  return { ok: true };
}

/** This part group is this LKQ component, on every vehicle. */
export async function confirmPartGroupMatch(input: {
  genartId: number;
  componentNumber: string;
}): Promise<PartGroupActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const genartId = genartIdOf(input.genartId);
  if (!genartId) return { ok: false, error: "That isn't a part group." };
  const component = componentByNumber(String(input.componentNumber ?? ""));
  if (!component) return { ok: false, error: "Pick a part from LKQ's list." };

  return update(genartId, {
    status: "confirmed",
    lkq_component: component.ComponentNumber,
    reviewed_by: gate.userId,
    reviewed_at: new Date().toISOString(),
  });
}

/** LKQ has nothing equivalent to this part group. */
export async function markPartGroupNoMatch(input: { genartId: number }): Promise<PartGroupActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const genartId = genartIdOf(input.genartId);
  if (!genartId) return { ok: false, error: "That isn't a part group." };

  return update(genartId, {
    status: "no_match",
    lkq_component: null,
    reviewed_by: gate.userId,
    reviewed_at: new Date().toISOString(),
  });
}

/** Undo a decision: back to unreviewed, where the name matcher's suggestion applies again. */
export async function resetPartGroupMatch(input: { genartId: number }): Promise<PartGroupActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const genartId = genartIdOf(input.genartId);
  if (!genartId) return { ok: false, error: "That isn't a part group." };

  return update(genartId, {
    status: "unreviewed",
    lkq_component: null,
    reviewed_by: null,
    reviewed_at: null,
  });
}

// ---------------------------------------------------------------------------
// Evidence: real parts for a real car.
// ---------------------------------------------------------------------------

export interface ComponentChoice {
  number: string;
  name: string;
}

export interface AdsCredits {
  used: number;
  cap: number;
}

export type PartGroupEvidenceResult =
  | {
      ok: true;
      reg: string;
      vehicle: string | null;
      /** LKQ parts that fit the car whose names share words with the group. Often wrong. */
      suggestions: ComponentChoice[];
      /** Every LKQ part that fits the car, by name. Null when LKQ couldn't say. */
      fitting: ComponentChoice[] | null;
      /** Why `fitting` is null. */
      fittingNote: string | null;
      credits: AdsCredits;
    }
  | { ok: false; error: string };

export type LkqExamplesResult = { ok: true; examples: ExamplesPanel; credits: AdsCredits } | { ok: false; error: string };

async function adsCredits(): Promise<AdsCredits> {
  try {
    const usage = await readAdsUsage(createAdminClient());
    return { used: usage.used, cap: usage.cap };
  } catch {
    return { used: 0, cap: 0 };
  }
}

function regOf(raw: unknown): string | null {
  const reg = adsRegKey(String(raw ?? ""));
  return reg.length >= 2 ? reg : null;
}

/**
 * The LKQ parts that fit one car, as candidates for a part group. Up to two LKQ
 * credits the first time for a car (identify it, list what fits), cached for
 * 30 days.
 */
export async function loadPartGroupEvidenceAction(input: {
  genartId: number;
  reg: string;
  /** Fallback when the part group hasn't been recorded yet. */
  description?: string | null;
}): Promise<PartGroupEvidenceResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const genartId = genartIdOf(input.genartId);
  if (!genartId) return { ok: false, error: "That isn't a part group." };
  const reg = regOf(input.reg);
  if (!reg) return { ok: false, error: "Enter a registration." };

  const { data } = await createAdminClient()
    .from(TABLE)
    .select("description")
    .eq("genart_id", genartId)
    .maybeSingle();
  const description = (data?.description as string | undefined) || input.description?.trim() || "";

  const fitting = await lkqFittingComponents(reg);
  if (fitting.state !== "ok") {
    return {
      ok: true,
      reg,
      vehicle: null,
      suggestions: [],
      fitting: null,
      fittingNote: fitting.message,
      credits: await adsCredits(),
    };
  }

  const toChoice = (c: { ComponentNumber: string; ComponentName: string }): ComponentChoice => ({
    number: c.ComponentNumber,
    name: c.ComponentName.trim(),
  });
  return {
    ok: true,
    reg,
    vehicle: fitting.vehicle,
    suggestions: suggestComponents(description, 6, fitting.components).map((s) => toChoice(s.component)),
    fitting: fitting.components.map(toChoice),
    fittingNote: null,
    credits: await adsCredits(),
  };
}

/** What LKQ lists for one component on one car. One LKQ credit the first time, cached for 7 days. */
export async function loadLkqComponentExamplesAction(input: {
  componentNumber: string;
  reg: string;
}): Promise<LkqExamplesResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;
  const reg = regOf(input.reg);
  if (!reg) return { ok: false, error: "Enter a registration." };
  const component = componentByNumber(String(input.componentNumber ?? ""));
  if (!component) return { ok: false, error: "Pick a part from LKQ's list." };

  const examples = await lkqComponentExamples(reg, component.ComponentNumber);
  return { ok: true, examples, credits: await adsCredits() };
}
