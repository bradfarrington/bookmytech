"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth/require-admin";
import { componentByNumber, searchComponents } from "@/lib/lkq/components";
import { createAdminClient } from "@/lib/supabase/admin";

// The admin's decisions on which LKQ component each TecDoc part group means
// (Task 45). One decision per part group applies to every vehicle. Writes go
// through the service-role client after an explicit admin check; nothing here
// calls a supplier or spends a credit.

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

/** Type-ahead over LKQ's checked-in component list. No network, no credits. */
export async function searchComponentsForMatch(
  query: string,
): Promise<Array<{ number: string; name: string }>> {
  const gate = await requireAdmin();
  if (!gate.ok) return [];
  return searchComponents(query, 20).map((c) => ({ number: c.ComponentNumber, name: c.ComponentName }));
}
