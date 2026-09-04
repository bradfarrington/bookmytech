// Our layer over HaynesPro's repair tree (Task 26): renamed and moved nodes,
// categories we created, and combined repairs. Pure — no I/O — so the
// composition can be unit-tested and shared by the customer catalogue
// (lib/haynespro/catalogue.ts) and the admin tree (/admin/repairs).
//
// Ids: HaynesPro node ids as they are; "g:<uuid>" for a category we created;
// "b:<option uuid>" for one bookable option of a combined repair. Both prefixes
// are safe because HaynesPro ids never contain ":".

import { billableHours } from "@/lib/pricing/billable";
import type { CatalogueNode } from "@/lib/haynespro/catalogue";
import type { HpRepairtimeNode } from "@/lib/haynespro/types";

export const ROOT_ID = "root";
const GROUP_PREFIX = "g:";
const OPTION_PREFIX = "b:";

export const isCustomGroupId = (id: string): boolean => id.startsWith(GROUP_PREFIX);
export const customGroupId = (uuid: string): string => `${GROUP_PREFIX}${uuid}`;
export const customGroupUuid = (id: string): string => id.slice(GROUP_PREFIX.length);
export const isBundleOptionId = (id: string): boolean => id.startsWith(OPTION_PREFIX);
export const bundleOptionId = (uuid: string): string => `${OPTION_PREFIX}${uuid}`;
export const bundleOptionUuid = (id: string): string => id.slice(OPTION_PREFIX.length);

// --- Rows, as the four tables hold them ------------------------------------

export interface CatalogueGroupRow {
  id: string;
  name: string;
  parent_id: string;
  display_order: number | null;
}

export interface CatalogueOverrideRow {
  node_id: string;
  kind: "group" | "repair";
  /** HaynesPro's name, snapshotted. */
  description: string | null;
  custom_name: string | null;
  /** Where it now lives; null = where HaynesPro lists it. */
  parent_id: string | null;
  display_order: number | null;
}

export interface BundleRow {
  id: string;
  name: string;
  description: string | null;
  parent_id: string;
  /** The pool of HaynesPro jobs the admin added once; every option picks from it. */
  node_ids: string[];
  display_order: number | null;
  is_active: boolean;
}

export interface BundleOptionRow {
  id: string;
  bundle_id: string;
  label: string;
  node_ids: string[];
  position: number | null;
}

export interface CatalogueOverlay {
  groups: CatalogueGroupRow[];
  overrides: Map<string, CatalogueOverrideRow>;
  bundles: BundleRow[];
  optionsByBundle: Map<string, BundleOptionRow[]>;
  optionsById: Map<string, BundleOptionRow>;
}

const byOrder = <T extends { display_order?: number | null; position?: number | null }>(
  a: T,
  b: T,
): number =>
  (a.display_order ?? a.position ?? 0) - (b.display_order ?? b.position ?? 0);

export function buildOverlay(rows: {
  groups?: readonly CatalogueGroupRow[] | null;
  overrides?: readonly CatalogueOverrideRow[] | null;
  bundles?: readonly BundleRow[] | null;
  options?: readonly BundleOptionRow[] | null;
}): CatalogueOverlay {
  const optionsByBundle = new Map<string, BundleOptionRow[]>();
  const optionsById = new Map<string, BundleOptionRow>();
  for (const option of rows.options ?? []) {
    const clean = { ...option, node_ids: uniqueIds(option.node_ids) };
    optionsById.set(option.id, clean);
    const list = optionsByBundle.get(option.bundle_id) ?? [];
    list.push(clean);
    optionsByBundle.set(option.bundle_id, list);
  }
  for (const list of optionsByBundle.values()) list.sort(byOrder);
  return {
    groups: [...(rows.groups ?? [])].sort(byOrder),
    overrides: new Map((rows.overrides ?? []).map((o) => [o.node_id, o])),
    bundles: (rows.bundles ?? [])
      .map((b) => ({ ...b, node_ids: uniqueIds(b.node_ids ?? []) }))
      .sort(byOrder),
    optionsByBundle,
    optionsById,
  };
}

export const EMPTY_OVERLAY: CatalogueOverlay = buildOverlay({});

export function uniqueIds(ids: readonly (string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const raw of ids) {
    const id = (raw ?? "").trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** The name customers see for a HaynesPro node: the admin's, else HaynesPro's. */
export function displayName(
  node: { id: string; description?: string | null },
  overlay: CatalogueOverlay,
): string {
  const custom = overlay.overrides.get(node.id)?.custom_name?.trim();
  return custom || node.description?.trim() || node.id;
}

/** What a bookable option is called: the bundle's name, plus its label when there is a choice. */
export function optionDisplayName(bundle: BundleRow, option: BundleOptionRow, optionCount: number): string {
  return optionCount > 1 ? `${bundle.name} · ${option.label}` : bundle.name;
}

/** Overrides that place a HaynesPro node at `levelId` (moved in from elsewhere). */
export function overridesMovedTo(levelId: string, overlay: CatalogueOverlay): CatalogueOverrideRow[] {
  return [...overlay.overrides.values()]
    .filter((o) => o.parent_id === levelId)
    .sort(byOrder);
}

export function bundlesAt(
  levelId: string,
  overlay: CatalogueOverlay,
): Array<{ bundle: BundleRow; options: BundleOptionRow[] }> {
  return overlay.bundles
    .filter((b) => b.parent_id === levelId)
    .map((bundle) => ({ bundle, options: overlay.optionsByBundle.get(bundle.id) ?? [] }));
}

/** Every HaynesPro node id a level might need a time for that HaynesPro's own listing won't supply. */
export function extraNodeIdsFor(levelId: string, overlay: CatalogueOverlay): string[] {
  const ids: string[] = [];
  for (const o of overridesMovedTo(levelId, overlay)) if (o.kind === "repair") ids.push(o.node_id);
  for (const { bundle, options } of bundlesAt(levelId, overlay)) {
    if (!bundle.is_active) continue;
    for (const option of options) ids.push(...option.node_ids);
  }
  return uniqueIds(ids);
}

// --- Composition -----------------------------------------------------------

export interface ComposeInput {
  levelId: string;
  /** HaynesPro's own subnodes of this level — [] for a category we created. */
  raw: readonly HpRepairtimeNode[];
  overlay: CatalogueOverlay;
  /** Node ids hidden for this vehicle (lib/haynespro/exclusions.ts). */
  excluded: ReadonlySet<string>;
  hourlyRatePence: number;
  /** Book time in hours per HaynesPro node id on THIS vehicle, for moved-in leaves and bundle jobs. */
  nodeHours: ReadonlyMap<string, number>;
  /** Hours for a set of jobs booked together — their sum by default. */
  combineHours: (nodeIds: string[]) => number | null;
}

function priceLeaf(
  id: string,
  description: string,
  rawHours: number | null | undefined,
  hourlyRatePence: number,
  extra: Partial<CatalogueNode> = {},
): CatalogueNode | null {
  const billed = billableHours(rawHours);
  if (billed == null) return null;
  return {
    id,
    description,
    kind: "repair",
    billedHours: billed,
    pricePence: Math.round(billed * hourlyRatePence),
    ...extra,
  };
}

/**
 * One level of the catalogue as the customer sees it: HaynesPro's nodes with
 * the admin's names, minus anything hidden or moved away; then anything moved
 * in, the categories created here, and the combined repairs listed here.
 */
export function composeLevel(input: ComposeInput): CatalogueNode[] {
  const { levelId, raw, overlay, excluded, hourlyRatePence, nodeHours, combineHours } = input;
  const nodes: CatalogueNode[] = [];
  const seen = new Set<string>();

  for (const hp of raw) {
    if (hp.id == null || excluded.has(hp.id)) continue;
    const override = overlay.overrides.get(hp.id);
    if (override?.parent_id && override.parent_id !== levelId) continue; // moved elsewhere
    const description = displayName({ id: hp.id, description: hp.description }, overlay);
    const node: CatalogueNode | null = hp.hasSubnodes
      ? { id: hp.id, description, kind: "group", billedHours: null, pricePence: null }
      : priceLeaf(
          hp.id,
          description,
          typeof hp.value === "number" ? hp.value / 100 : null,
          hourlyRatePence,
        );
    if (node) {
      nodes.push(node);
      seen.add(node.id);
    }
  }

  for (const override of overridesMovedTo(levelId, overlay)) {
    if (seen.has(override.node_id) || excluded.has(override.node_id)) continue;
    const description =
      override.custom_name?.trim() || override.description?.trim() || override.node_id;
    if (override.kind === "group") {
      nodes.push({ id: override.node_id, description, kind: "group", billedHours: null, pricePence: null });
      seen.add(override.node_id);
      continue;
    }
    // A leaf moved in is only shown when this vehicle has a time for it.
    const node = priceLeaf(override.node_id, description, nodeHours.get(override.node_id), hourlyRatePence);
    if (node) {
      nodes.push(node);
      seen.add(node.id);
    }
  }

  for (const group of overlay.groups) {
    if (group.parent_id !== levelId) continue;
    nodes.push({
      id: customGroupId(group.id),
      description: group.name,
      kind: "group",
      billedHours: null,
      pricePence: null,
      custom: true,
    });
  }

  for (const { bundle, options } of bundlesAt(levelId, overlay)) {
    if (!bundle.is_active) continue;
    for (const option of options) {
      const ids = option.node_ids;
      if (ids.length === 0) continue;
      // Every job in the option must exist and be bookable on this vehicle.
      if (ids.some((id) => excluded.has(id) || !((nodeHours.get(id) ?? 0) > 0))) continue;
      const node = priceLeaf(
        bundleOptionId(option.id),
        optionDisplayName(bundle, option, options.length),
        combineHours(ids),
        hourlyRatePence,
        {
          bundleId: bundle.id,
          bundleName: bundle.name,
          optionLabel: options.length > 1 ? option.label : null,
        },
      );
      if (node) nodes.push(node);
    }
  }

  return nodes;
}

// --- Booking: what a chosen id stands for ----------------------------------

export interface CatalogueItem {
  /** The id as chosen — a HaynesPro node id or a "b:" option id. */
  id: string;
  /** The combined repair's display name; null for a plain job. */
  label: string | null;
  /** The HaynesPro jobs it stands for. */
  nodeIds: string[];
}

/**
 * Expand chosen ids into the HaynesPro jobs they stand for. Null when an id
 * is a category or an unknown / switched-off / empty combined repair — the
 * quote refuses rather than guessing.
 */
export function expandCatalogueItems(
  ids: readonly string[],
  overlay: CatalogueOverlay,
): CatalogueItem[] | null {
  const items: CatalogueItem[] = [];
  for (const id of uniqueIds(ids)) {
    if (isCustomGroupId(id)) return null;
    if (!isBundleOptionId(id)) {
      items.push({ id, label: null, nodeIds: [id] });
      continue;
    }
    const option = overlay.optionsById.get(bundleOptionUuid(id));
    const bundle = option ? overlay.bundles.find((b) => b.id === option.bundle_id) : undefined;
    if (!option || !bundle || !bundle.is_active || option.node_ids.length === 0) return null;
    const siblings = overlay.optionsByBundle.get(bundle.id) ?? [];
    items.push({
      id,
      label: optionDisplayName(bundle, option, siblings.length),
      nodeIds: [...option.node_ids],
    });
  }
  return items;
}
