import Link from "next/link";
import { ChevronRight, FolderOpen, Layers, Lock, MoveRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import type { ExclusionTarget } from "@/app/actions/vehicle-exclusions";
import {
  exclusionStateForModel,
  isNodeVisible,
  nodeAvailability,
  type NodeAvailability,
  type RepairExclusionRow,
} from "@/lib/haynespro/exclusions";
import { getRepairNodesByIds, getRepairtimeSubnodes, getRepairtimeTypeId } from "@/lib/haynespro/tree";
import type { HpRepairtimeNode } from "@/lib/haynespro/types";
import { loadCatalogueOverlay } from "@/lib/catalogue/load-overlay";
import {
  bundlesAt,
  customGroupId,
  isCustomGroupId,
  overridesMovedTo,
  uniqueIds,
} from "@/lib/catalogue/overlay";
import { repairGroupIcon } from "@/lib/repair-group-icons";
import { RepairToggle } from "./repair-toggle";
import { BundleCard, type BundleCardJob, type BundleCardOption } from "../../repairs/_components/bundle-card";
import {
  CombineControl,
  GroupDelete,
  GroupMove,
  GroupName,
  NewCategoryForm,
  NodeMove,
  NodeName,
  type BundleTarget,
  type Destination,
} from "../../repairs/_components/node-controls";

// The repair catalogue for one car type — HaynesPro's tree plus the admin's
// layer over it (Task 26: names, moves, our categories, combined repairs) —
// with availability toggles (Task 16 Stage G; scopes in Task 23). Two homes:
//
//   /admin/repairs                       target { scope: "global" }, `editing`
//                                        set — switches hide for EVERY vehicle,
//                                        and the rename / move / combine
//                                        controls are shown;
//   /admin/vehicles/[make]/[model]       target { scope: "model", … } — this
//                                        model only, read-only overlay.
//
// `linkBase` is the page URL up to and including its own query (e.g.
// "/admin/repairs?type=317000222"); the panel appends &node= and &crumbs=.

export interface CatalogueEditing {
  /** Where a thing can be listed. */
  destinations: Destination[];
  /** Existing combined repairs a job can be added to. */
  bundleTargets: BundleTarget[];
}

export interface RepairTreePanelProps {
  carTypeId: number;
  target: ExclusionTarget;
  linkBase: string;
  nodeId: string;
  /** "id~label|id~label" trail down to the current node. */
  crumbs: string;
  editing?: CatalogueEditing;
}

interface GroupRow {
  id: string;
  name: string;
  /** HaynesPro's own name (null for a category we created). */
  original: string | null;
  source: "haynespro" | "moved" | "custom";
  /** Override parent for a HaynesPro node; the category's parent for one of ours. */
  parent: string | null;
  customUuid?: string;
}

interface LeafRow {
  id: string;
  name: string;
  original: string | null;
  hours: number | null;
  source: "haynespro" | "moved";
  parent: string | null;
}

function fmtHours(n: number): string {
  return `${Number(n.toFixed(2))}h`;
}

/** The small caption under a node explaining a state its toggle alone can't. */
function availabilityNote(
  availability: NodeAvailability,
  globalScope: boolean,
): { text: string; lock?: boolean; href?: string } | null {
  if (globalScope) return null;
  switch (availability) {
    case "hidden_global":
      return { text: "Hidden for all vehicles", lock: true, href: "/admin/repairs" };
    case "shown_override":
      return { text: "Shown for this model · hidden elsewhere" };
    case "hidden_model":
      return { text: "Hidden from customers" };
    default:
      return null;
  }
}

export async function RepairTreePanel({
  carTypeId,
  target,
  linkBase,
  nodeId,
  crumbs,
  editing,
}: RepairTreePanelProps) {
  const repairtimeTypeId = await getRepairtimeTypeId(carTypeId);
  if (repairtimeTypeId == null) {
    return (
      <div className="rounded-button border border-border bg-surface-card px-4 py-8 text-center text-sm text-text-muted">
        HaynesPro has no repair-times coverage for this variant.
      </div>
    );
  }

  const supabase = await createClient();
  // The whole (small) exclusions table, partitioned in memory by the same rule
  // the funnel applies — so this page and the customer browser can't disagree.
  const [rawNodes, { data: exclusionRows }, overlay] = await Promise.all([
    isCustomGroupId(nodeId)
      ? Promise.resolve([] as HpRepairtimeNode[])
      : getRepairtimeSubnodes(repairtimeTypeId, nodeId),
    supabase.from("repair_vehicle_exclusions").select("*"),
    loadCatalogueOverlay(createAdminClient()),
  ]);
  const global = target.scope === "global";
  const state = exclusionStateForModel(
    (exclusionRows ?? []) as RepairExclusionRow[],
    global ? "" : target.makeName,
    global ? "" : target.modelName,
  );
  // What the toggle shows: in model scope the effective state for THIS model
  // (overrides included); in global scope only the global hide itself.
  const visibleFor = (id: string) =>
    global ? !state.globalHidden.has(id) : isNodeVisible(nodeAvailability(id, state));

  // Times for jobs HaynesPro's listing of this level doesn't include: leaves
  // moved in, and the pool of every combined repair listed here.
  const movedIn = overridesMovedTo(nodeId, overlay);
  const bundlesHere = bundlesAt(nodeId, overlay);
  const extraIds = uniqueIds([
    ...movedIn.filter((o) => o.kind === "repair").map((o) => o.node_id),
    ...bundlesHere.flatMap((b) => [...b.bundle.node_ids, ...b.options.flatMap((o) => o.node_ids)]),
  ]);
  const extraNodes = extraIds.length ? await getRepairNodesByIds(repairtimeTypeId, extraIds) : [];
  const extraById = new Map(extraNodes.filter((n) => n.id != null).map((n) => [n.id as string, n]));
  const nameFor = (id: string) =>
    overlay.overrides.get(id)?.custom_name?.trim() ||
    extraById.get(id)?.description?.trim() ||
    overlay.overrides.get(id)?.description?.trim() ||
    id;

  // --- Rows -----------------------------------------------------------------
  const groups: GroupRow[] = [];
  const leaves: LeafRow[] = [];
  const seen = new Set<string>();
  for (const hp of rawNodes) {
    if (hp.id == null) continue;
    const override = overlay.overrides.get(hp.id);
    if (override?.parent_id && override.parent_id !== nodeId) continue; // moved elsewhere
    seen.add(hp.id);
    const name = override?.custom_name?.trim() || hp.description?.trim() || hp.id;
    if (hp.hasSubnodes) {
      groups.push({ id: hp.id, name, original: hp.description ?? null, source: "haynespro", parent: override?.parent_id ?? null });
    } else {
      leaves.push({
        id: hp.id,
        name,
        original: hp.description ?? null,
        hours: typeof hp.value === "number" && hp.value > 0 ? hp.value / 100 : null,
        source: "haynespro",
        parent: override?.parent_id ?? null,
      });
    }
  }
  for (const override of movedIn) {
    if (seen.has(override.node_id)) continue;
    const name = override.custom_name?.trim() || override.description?.trim() || override.node_id;
    if (override.kind === "group") {
      groups.push({ id: override.node_id, name, original: override.description, source: "moved", parent: override.parent_id });
    } else {
      const value = extraById.get(override.node_id)?.value;
      leaves.push({
        id: override.node_id,
        name,
        original: override.description,
        hours: typeof value === "number" && value > 0 ? value / 100 : null,
        source: "moved",
        parent: override.parent_id,
      });
    }
  }
  for (const group of overlay.groups) {
    if (group.parent_id !== nodeId) continue;
    groups.push({ id: customGroupId(group.id), name: group.name, original: null, source: "custom", parent: group.parent_id, customUuid: group.id });
  }
  const bundleCards = bundlesHere.map(({ bundle, options }) => {
    // The pool, plus any job an option still names that fell out of the pool
    // (rows written before the pool existed) — so nothing is invisible.
    const poolIds = uniqueIds([...bundle.node_ids, ...options.flatMap((o) => o.node_ids)]);
    const jobs: BundleCardJob[] = poolIds.map((id) => {
      const value = extraById.get(id)?.value;
      return {
        nodeId: id,
        description: nameFor(id),
        hours: typeof value === "number" && value > 0 ? value / 100 : null,
      };
    });
    return {
      bundle: { id: bundle.id, name: bundle.name, parentId: bundle.parent_id, isActive: bundle.is_active },
      jobs,
      options: options.map((option): BundleCardOption => ({ id: option.id, label: option.label, nodeIds: option.node_ids })),
    };
  });

  const trail = crumbs
    ? crumbs.split("|").map((part) => {
        const [id, ...label] = part.split("~");
        return { id, label: label.join("~") };
      })
    : [];
  const nodeHref = (id: string, label: string) => {
    const nextCrumbs = [...trail, { id, label }]
      .map((c) => `${c.id}~${c.label}`)
      .join("|");
    return `${linkBase}&node=${encodeURIComponent(id)}&crumbs=${encodeURIComponent(nextCrumbs)}`;
  };
  const crumbHref = (index: number) => {
    if (index < 0) return linkBase;
    const upto = trail.slice(0, index + 1);
    return `${linkBase}&node=${encodeURIComponent(upto[index].id)}&crumbs=${encodeURIComponent(upto.map((c) => `${c.id}~${c.label}`).join("|"))}`;
  };

  const sourceCaption = (source: GroupRow["source"] | LeafRow["source"]) =>
    source === "moved" ? "Moved here" : source === "custom" ? "Your category" : null;

  const empty = groups.length === 0 && leaves.length === 0 && bundleCards.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav className="flex flex-wrap items-center gap-1.5 text-sm text-text-secondary">
          <Link href={crumbHref(-1)} className="font-semibold text-brand-blue hover:underline">
            All groups
          </Link>
          {trail.map((c, i) => (
            <span key={`${c.id}-${i}`} className="flex items-center gap-1.5">
              <span className="text-text-muted">/</span>
              {i === trail.length - 1 ? (
                <span className="font-semibold text-text-primary">{c.label}</span>
              ) : (
                <Link href={crumbHref(i)} className="text-brand-blue hover:underline">
                  {c.label}
                </Link>
              )}
            </span>
          ))}
        </nav>
        {editing && <NewCategoryForm parentId={nodeId} />}
      </div>

      {empty && (
        <p className="rounded-2xl border border-border bg-surface-card px-4 py-8 text-center text-sm text-text-muted shadow-card">
          Nothing under this group{editing ? " yet — create a category, or move jobs and groups here from elsewhere in the tree." : "."}
        </p>
      )}

      {/* Sub-groups. Read-only: icon tiles that open on click. Editing: rows with
          the name editor, move-to and the hide switch, opened by the chevron. */}
      {groups.length > 0 && !editing && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {groups.map((row) => {
            const hpNode = row.source !== "custom";
            const visible = hpNode ? visibleFor(row.id) : true;
            const note = hpNode ? availabilityNote(nodeAvailability(row.id, state), global) : null;
            const caption = note?.text ?? sourceCaption(row.source);
            const GroupIcon = row.source === "custom" ? FolderOpen : repairGroupIcon(row.original ?? row.name);
            return (
              <div
                key={row.id}
                className={cn(
                  "relative rounded-xl border border-border bg-surface-card shadow-card transition-colors hover:border-brand-blue/40",
                  !visible && "opacity-60",
                )}
              >
                {hpNode && (
                  <span className="absolute right-8 top-1/2 z-10 -translate-y-1/2">
                    <RepairToggle target={target} nodeId={row.id} description={row.original} initialAvailable={visible} />
                  </span>
                )}
                <Link href={nodeHref(row.id, row.name)} className="flex items-center gap-2.5 py-2.5 pl-2.5 pr-14">
                  <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", visible ? "bg-blue-50" : "bg-surface")}>
                    <GroupIcon size={16} className={visible ? "text-brand-blue" : "text-text-muted"} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={cn("truncate text-sm font-semibold", visible ? "text-text-primary" : "text-text-muted")} title={row.name}>
                      {row.name}
                    </span>
                    {caption && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-text-muted">
                        {note?.lock && <Lock size={10} />}
                        {caption}
                      </span>
                    )}
                  </span>
                  <ChevronRight size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {/* Editing: the same cards, at every level, with the name editor, Move
          to…, the hide switch and an Open button. */}
      {groups.length > 0 && editing && (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {groups.map((row) => {
            const hpNode = row.source !== "custom";
            const visible = hpNode ? visibleFor(row.id) : true;
            const GroupIcon = row.source === "custom" ? FolderOpen : repairGroupIcon(row.original ?? row.name);
            const caption = sourceCaption(row.source);
            return (
              <div
                key={row.id}
                className={cn(
                  "flex flex-col gap-2 rounded-xl border border-border bg-surface-card p-2.5 shadow-card transition-colors hover:border-brand-blue/40",
                  !visible && "opacity-60",
                )}
              >
                <div className="flex items-start gap-2">
                  <Link
                    href={nodeHref(row.id, row.name)}
                    className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", visible ? "bg-blue-50" : "bg-surface")}
                    aria-label={`Open ${row.name}`}
                  >
                    <GroupIcon size={16} className={visible ? "text-brand-blue" : "text-text-muted"} />
                  </Link>
                  <div className="min-w-0 flex-1 pt-0.5">
                    {hpNode ? (
                      <NodeName nodeId={row.id} kind="group" description={row.original} customName={row.name !== row.original ? row.name : null} className="w-full text-[13px] font-semibold leading-tight text-text-primary" />
                    ) : (
                      <GroupName groupId={row.customUuid!} name={row.name} className="w-full text-[13px] font-semibold leading-tight text-text-primary" />
                    )}
                    {caption && <p className="text-[11px] font-medium text-text-muted">{caption}</p>}
                  </div>
                  <span className="shrink-0 pt-1">
                    {hpNode ? (
                      <RepairToggle target={target} nodeId={row.id} description={row.original} initialAvailable={visible} />
                    ) : (
                      <GroupDelete groupId={row.customUuid!} name={row.name} />
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {hpNode ? (
                    <NodeMove nodeId={row.id} kind="group" description={row.original} currentParent={row.parent} destinations={editing.destinations} className="min-w-0 flex-1" />
                  ) : (
                    <GroupMove groupId={row.customUuid!} currentParent={row.parent ?? "root"} destinations={editing.destinations} className="min-w-0 flex-1" />
                  )}
                  <Link
                    href={nodeHref(row.id, row.name)}
                    aria-label={`Open ${row.name}`}
                    title="Open"
                    className="flex size-10 shrink-0 items-center justify-center rounded-button border border-border text-text-secondary transition-colors hover:border-brand-blue/40 hover:text-brand-blue"
                  >
                    <ChevronRight size={16} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Timed leaf repairs — hours + availability toggle (+ editing controls). */}
      {leaves.length > 0 && (
        // No overflow-hidden here: the Move to… / Combine… dropdowns open past
        // the row's bottom edge and would be clipped. The header rounds itself.
        <div className="rounded-2xl border border-border bg-surface-card shadow-card">
          {(groups.length > 0 || bundleCards.length > 0) && (
            <p className="rounded-t-2xl border-b border-border-subtle bg-surface px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Timed repairs
            </p>
          )}
          <ul className="divide-y divide-border-subtle">
            {leaves.map((row) => {
              const visible = visibleFor(row.id);
              const note = availabilityNote(nodeAvailability(row.id, state), global);
              const caption = note?.text ?? sourceCaption(row.source);
              return (
                <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <div className={cn("min-w-0 flex-1", visible ? "text-text-secondary" : "text-text-muted")}>
                    {editing ? (
                      <NodeName nodeId={row.id} kind="repair" description={row.original} customName={row.name !== row.original ? row.name : null} />
                    ) : (
                      row.name
                    )}
                    {caption && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-text-muted">
                        {note?.lock && <Lock size={10} />}
                        {note?.href ? (
                          <Link href={note.href} className="underline hover:text-text-primary">{caption}</Link>
                        ) : (
                          caption
                        )}
                      </span>
                    )}
                  </div>
                  <span className={cn("shrink-0 font-semibold", visible ? "text-text-primary" : "text-text-muted")}>
                    {row.hours != null ? fmtHours(row.hours) : "—"}
                  </span>
                  {editing && (
                    <>
                      <NodeMove nodeId={row.id} kind="repair" description={row.original} currentParent={row.parent} destinations={editing.destinations} />
                      <CombineControl nodeId={row.id} description={row.original} parentId={nodeId} bundleTargets={editing.bundleTargets} />
                    </>
                  )}
                  <RepairToggle target={target} nodeId={row.id} description={row.original} initialAvailable={visible} />
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Combined repairs listed here. */}
      {bundleCards.length > 0 && (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
            <Layers size={12} />
            Combined repairs
          </p>
          {bundleCards.map((card) => (
            <BundleCard
              key={card.bundle.id}
              bundle={card.bundle}
              jobs={card.jobs}
              options={card.options}
              destinations={editing?.destinations ?? []}
              readOnly={!editing}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-text-muted">
        {editing ? (
          <>
            Switching a repair or group off hides it for every make and model; a model&apos;s page under
            Vehicles can still switch it back on for that model alone. Rename anything with the pencil,
            move it with &ldquo;Move to…&rdquo;, and combine jobs into one bookable repair with
            &ldquo;Combine…&rdquo; (or the search box on its card) — the separate jobs stay available
            too. Times shown are for the reference vehicle; every vehicle gets its own.
            <MoveRight size={10} className="ml-1 inline" />
          </>
        ) : (
          "Switching a repair or group off hides it from the customer “Repairs for your car” browser for every variant of this model. Hiding a group hides everything inside it. A repair hidden for all vehicles (under Repairs) can be switched back on here — for this model only."
        )}
      </p>
    </div>
  );
}
