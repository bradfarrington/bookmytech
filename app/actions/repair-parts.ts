"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import { getRepairNodesByIds } from "@/lib/haynespro/tree";
import { cacheRegKey, resolveVehicle } from "@/lib/haynespro/vehicle";
import { adsLookupVehicle } from "@/lib/lkq/ads";
import { readAdsUsage } from "@/lib/lkq/ads-cache";
import { isLkqAdsConfigured } from "@/lib/lkq/config";
import type { PartGroupMapping } from "@/lib/lkq/mapping";
import {
  resolvePartGroupLink,
  type PartGroupLinkRow,
  type ResolvedPartGroupLink,
} from "@/lib/parts/part-group-match";
import { partGroupsOnNodes } from "@/lib/parts/part-groups";
import {
  selectRepairPart,
  type PartSelection,
  type RepairPartChoiceRow,
} from "@/lib/parts/repair-part-choice";
import type { SupplierId, SupplierPanel } from "@/lib/parts/supplier-offer";
import { lookupAagPanel, lookupLkqPanel } from "@/lib/parts/supplier-lookup";
import { createAdminClient } from "@/lib/supabase/admin";

// A repair's parts on one engine variant (Task 45), for the admin vehicle model
// page. HaynesPro says which part groups the repair uses; LKQ (through the part
// group's match) and Alliance Automotive (by part group directly) say what fits
// this vehicle and what it costs; the default part is the dearest, unless an
// admin chose another for this variant.
//
// Suppliers can only price a real registration, never a make/model/engine from
// a list. So a variant is priced through a registration known to BE that
// variant: one a customer already looked up (haynespro_vehicle_cache), or one
// the admin types, which is checked against the variant and — by being
// resolved — remembered in that same cache.
//
// Admin-only on every call: these spend metered LKQ credits and return trade
// prices. READ-ONLY against suppliers; nothing orders.

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

export interface RepairPartGroupView {
  genartId: number;
  description: string;
  lkqLink: {
    kind: ResolvedPartGroupLink["kind"];
    componentNumber: string | null;
    componentName: string | null;
  };
  lkq: SupplierPanel;
  aag: SupplierPanel;
  selection: PartSelection;
}

export type RepairPartsResult =
  | { ok: true; state: "needs_reg"; reason: string | null }
  | {
      ok: true;
      state: "ready";
      reg: string;
      vehicle: string | null;
      groups: RepairPartGroupView[];
      credits: { used: number; cap: number };
    }
  | { ok: false; error: string };

export type RepairPartActionResult = { ok: true } | { ok: false; error: string };

function positiveInt(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** A registration already known to be this engine variant; a customer's own correction first. */
async function savedRegFor(db: SupabaseAdmin, carTypeId: number): Promise<string | null> {
  try {
    const { data } = await db
      .from("haynespro_vehicle_cache")
      .select("reg, resolved_via, created_at")
      .eq("car_type_id", carTypeId)
      .order("created_at", { ascending: false })
      .limit(10);
    const rows = (data ?? []) as Array<{ reg: string; resolved_via: string | null }>;
    return (rows.find((r) => r.resolved_via === "manual") ?? rows[0])?.reg ?? null;
  } catch {
    return null;
  }
}

function lkqNotMapped(link: ResolvedPartGroupLink): SupplierPanel {
  if (link.kind === "no_match") {
    return { state: "not_mapped", message: "LKQ has no equivalent for this part group." };
  }
  if (link.kind === "stale") {
    return {
      state: "not_mapped",
      message: `This part group was matched to LKQ part ${link.componentNumber}, which LKQ no longer lists. Match it again under Parts → Part group matches.`,
    };
  }
  return {
    state: "not_mapped",
    message: "This part group isn't matched to an LKQ part yet. Match it under Parts → Part group matches.",
  };
}

export async function loadRepairPartsAction(input: {
  carTypeId: number;
  nodeId: string;
  /** A registration the admin typed for this variant. Omit to use a saved one. */
  reg?: string | null;
}): Promise<RepairPartsResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const carTypeId = positiveInt(input.carTypeId);
  const nodeId = String(input.nodeId ?? "").trim();
  if (!carTypeId || !nodeId) return { ok: false, error: "That repair couldn't be found." };

  const db = createAdminClient();
  const typed = input.reg ? cacheRegKey(input.reg) : "";
  if (input.reg && !typed) return { ok: true, state: "needs_reg", reason: "Enter a registration." };
  const reg = typed || (await savedRegFor(db, carTypeId));
  if (!reg) return { ok: true, state: "needs_reg", reason: null };

  // Prove the registration is THIS variant. A saved one is a cache hit; a typed
  // one is identified now and, when it matches, stays saved for next time.
  const vehicle = await resolveVehicle(reg, db);
  if (!vehicle) {
    return { ok: true, state: "needs_reg", reason: `We couldn't identify ${reg}. Check it and try again.` };
  }
  if (vehicle.carTypeId !== carTypeId) {
    return {
      ok: true,
      state: "needs_reg",
      reason: `${reg} is a ${vehicle.description ?? "different vehicle"}, not this engine variant.`,
    };
  }
  if (vehicle.repairtimeTypeId == null) {
    return { ok: false, error: "HaynesPro has no repair times for this engine variant." };
  }

  const nodes = await getRepairNodesByIds({ carTypeId, repairtimeTypeId: vehicle.repairtimeTypeId }, [nodeId]);
  const node = nodes.find((n) => n.id === nodeId) ?? (nodes.length === 1 ? nodes[0] : undefined);
  if (!node) return { ok: false, error: "HaynesPro didn't return that repair for this engine variant." };

  const credits = async () => {
    try {
      const usage = await readAdsUsage(db);
      return { used: usage.used, cap: usage.cap };
    } catch {
      return { used: 0, cap: 0 };
    }
  };

  const seen = partGroupsOnNodes([node]);
  if (seen.length === 0) {
    return { ok: true, state: "ready", reg, vehicle: vehicle.description, groups: [], credits: await credits() };
  }

  const ids = seen.map((g) => g.genartId);
  const [linkRows, choiceRows] = await Promise.all([
    db
      .from("part_group_links")
      .select("genart_id, description, sample_repair, status, lkq_component, reviewed_at, first_seen_at")
      .in("genart_id", ids),
    db
      .from("repair_part_choices")
      .select("car_type_id, node_id, genart_id, supplier, part_number, brand, description, chosen_at")
      .eq("car_type_id", carTypeId)
      .eq("node_id", nodeId),
  ]);
  const links = new Map(((linkRows.data ?? []) as PartGroupLinkRow[]).map((r) => [r.genart_id, r]));
  const choices = new Map(((choiceRows.data ?? []) as RepairPartChoiceRow[]).map((r) => [r.genart_id, r]));

  const resolved = seen.map((g) => {
    const row = links.get(g.genartId);
    const description = row?.description || g.description || `Part group ${g.genartId}`;
    const link = resolvePartGroupLink({
      status: row?.status ?? "unreviewed",
      lkq_component: row?.lkq_component ?? null,
      description,
    });
    return { genartId: g.genartId, description, link };
  });

  // The part lookups below run in parallel and each needs the LKQ vehicle. Pay
  // for it once, before they start, rather than once per lookup on a cold cache.
  const lkqNeeded = resolved.some((r) => r.link.kind === "confirmed" || r.link.kind === "auto");
  if (lkqNeeded && isLkqAdsConfigured()) await adsLookupVehicle(reg);

  const groups = await Promise.all(
    resolved.map(async ({ genartId, description, link }): Promise<RepairPartGroupView> => {
      const component = link.kind === "confirmed" || link.kind === "auto" ? link.component : null;
      const group: PartGroupMapping = {
        key: `genart:${genartId}`,
        label: description,
        genart: String(genartId),
        component: component?.ComponentNumber ?? null,
        componentName: component?.ComponentName ?? null,
        confidence: link.kind === "confirmed" ? "verified" : "assumed",
      };
      const [lkq, aag] = await Promise.all([
        component ? lookupLkqPanel(reg, group).then((r) => r.panel) : Promise.resolve(lkqNotMapped(link)),
        lookupAagPanel(reg, group),
      ]);
      return {
        genartId,
        description,
        lkqLink: {
          kind: link.kind,
          componentNumber: component?.ComponentNumber ?? (link.kind === "stale" ? link.componentNumber : null),
          componentName: component?.ComponentName ?? null,
        },
        lkq,
        aag,
        selection: selectRepairPart([lkq, aag], choices.get(genartId) ?? null),
      };
    }),
  );

  return { ok: true, state: "ready", reg, vehicle: vehicle.description, groups, credits: await credits() };
}

/** Use this part for this repair's part group on this engine variant. */
export async function chooseRepairPartAction(input: {
  carTypeId: number;
  nodeId: string;
  genartId: number;
  supplier: SupplierId;
  partNumber: string;
  brand: string | null;
  description: string | null;
}): Promise<RepairPartActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const carTypeId = positiveInt(input.carTypeId);
  const genartId = positiveInt(input.genartId);
  const nodeId = String(input.nodeId ?? "").trim();
  const partNumber = String(input.partNumber ?? "").trim();
  if (!carTypeId || !genartId || !nodeId) return { ok: false, error: "That repair couldn't be found." };
  if (input.supplier !== "lkq" && input.supplier !== "aag") return { ok: false, error: "Pick a part from the list." };
  if (!partNumber) return { ok: false, error: "Pick a part from the list." };

  const { error } = await createAdminClient()
    .from("repair_part_choices")
    .upsert(
      {
        car_type_id: carTypeId,
        node_id: nodeId,
        genart_id: genartId,
        supplier: input.supplier,
        part_number: partNumber,
        brand: input.brand?.trim() || null,
        description: input.description?.trim() || null,
        chosen_by: gate.userId,
        chosen_at: new Date().toISOString(),
      },
      { onConflict: "car_type_id,node_id,genart_id" },
    );
  if (error) return { ok: false, error: `Couldn't save that part: ${error.message}` };
  return { ok: true };
}

/** Forget the choice: this repair's part group goes back to the dearest part. */
export async function resetRepairPartAction(input: {
  carTypeId: number;
  nodeId: string;
  genartId: number;
}): Promise<RepairPartActionResult> {
  const gate = await requireAdmin();
  if (!gate.ok) return gate;

  const carTypeId = positiveInt(input.carTypeId);
  const genartId = positiveInt(input.genartId);
  const nodeId = String(input.nodeId ?? "").trim();
  if (!carTypeId || !genartId || !nodeId) return { ok: false, error: "That repair couldn't be found." };

  const { error } = await createAdminClient()
    .from("repair_part_choices")
    .delete()
    .eq("car_type_id", carTypeId)
    .eq("node_id", nodeId)
    .eq("genart_id", genartId);
  if (error) return { ok: false, error: `Couldn't reset that part: ${error.message}` };
  return { ok: true };
}
