// Recording the TecDoc part groups HaynesPro's repairs name, and reading the
// admin's matches (Task 45).
//
// Every HaynesPro repair node can carry `genarts: [{id, description}]` — the
// part groups that repair uses. Whenever repair nodes are fetched
// (lib/haynespro/tree.ts), any part group this instance hasn't seen yet is
// inserted into `part_group_links` as unreviewed, so the review list at
// /admin/parts/groups fills itself from real browsing, with no extra HaynesPro
// calls. Insert-only: an existing row, and any admin decision on it, is never
// touched.
//
// The write is scheduled with `after()`, so it never slows the page or API
// response that fetched the repairs, and it can never fail one: every error is
// swallowed. Until migration 0066 is applied the table is missing; the first
// such error switches recording off for the life of the instance.
//
// NB the service-role client is imported dynamically so the pure helper stays
// unit-testable without "server-only" — same pattern as lib/haynespro/client.ts.

import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";

import type { HpRepairtimeNode } from "@/lib/haynespro/types";
import type { PartGroupLinkRow } from "./part-group-match";

const TABLE = "part_group_links";

export interface SeenPartGroup {
  genartId: number;
  description: string;
  /** A repair that uses it, for context on the review page. */
  sampleRepair: string | null;
}

/** Distinct part groups on a set of repair nodes, first sighting wins. Pure — unit-tested. */
export function partGroupsOnNodes(nodes: readonly HpRepairtimeNode[]): SeenPartGroup[] {
  const byId = new Map<number, SeenPartGroup>();
  for (const node of nodes) {
    for (const group of node.genarts ?? []) {
      if (typeof group?.id !== "number" || group.id <= 0 || byId.has(group.id)) continue;
      byId.set(group.id, {
        genartId: group.id,
        description: group.description?.trim() ?? "",
        sampleRepair: node.description?.trim() || null,
      });
    }
  }
  return [...byId.values()];
}

/** Part group ids this instance has already sent, so a warm instance does no work. */
const recorded = new Set<number>();
let recordingOff = false;

/** PostgREST / Postgres codes for "that table doesn't exist". */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

async function insertPartGroups(groups: SeenPartGroup[]): Promise<void> {
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { error } = await createAdminClient()
      .from(TABLE)
      .upsert(
        groups.map((g) => ({ genart_id: g.genartId, description: g.description, sample_repair: g.sampleRepair })),
        { onConflict: "genart_id", ignoreDuplicates: true },
      );
    if (!error) return;
    if (isMissingTable(error)) recordingOff = true;
    for (const g of groups) recorded.delete(g.genartId);
  } catch {
    for (const g of groups) recorded.delete(g.genartId);
  }
}

/** Record any part groups on these nodes not yet listed. Never throws, never blocks the caller. */
export function notePartGroups(nodes: readonly HpRepairtimeNode[] | null | undefined): void {
  if (recordingOff || !nodes?.length) return;
  const fresh = partGroupsOnNodes(nodes).filter((g) => !recorded.has(g.genartId));
  if (fresh.length === 0) return;
  for (const g of fresh) recorded.add(g.genartId);

  const write = () => insertPartGroups(fresh);
  try {
    after(write);
  } catch {
    // Outside a request (a script, a test): there is no response to wait for.
    void write();
  }
}

/** Every recorded part group, for the review page. Fails open to an empty list. */
export async function loadPartGroupLinks(
  db: SupabaseClient,
): Promise<{ rows: PartGroupLinkRow[]; missingTable: boolean }> {
  try {
    const { data, error } = await db
      .from(TABLE)
      .select("genart_id, description, sample_repair, status, lkq_component, reviewed_at, first_seen_at")
      .order("genart_id", { ascending: true });
    if (error) return { rows: [], missingTable: isMissingTable(error) };
    return { rows: (data ?? []) as PartGroupLinkRow[], missingTable: false };
  } catch {
    return { rows: [], missingTable: false };
  }
}
