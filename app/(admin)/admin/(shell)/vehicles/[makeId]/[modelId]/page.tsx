import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, ChevronRight, ClipboardList, Clock, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { Overline } from "@/components/ui/overline";
import type { ExclusionTarget } from "@/app/actions/vehicle-exclusions";
import {
  getAdjustments,
  getCapacities,
  getIdLocations,
  getModelWithTypes,
  getRepairtimeSubnodes,
  getRepairtimeTypeId,
  getStory,
  getStoryList,
} from "@/lib/haynespro/tree";
import type { HpAdjustment, HpStoryLine, HpTreeNode } from "@/lib/haynespro/types";
import {
  exclusionStateForModel,
  isNodeVisible,
  nodeAvailability,
  type ExclusionScope,
  type NodeAvailability,
  type RepairExclusionRow,
} from "@/lib/haynespro/exclusions";
import { repairGroupIcon } from "@/lib/repair-group-icons";
import { RepairToggle } from "../../_components/repair-toggle";
import { ScopePicker } from "../../_components/scope-picker";
import { TypePicker } from "../../_components/type-picker";

// Admin model page (Task 16 Stage E): repair availability toggles over the
// repair-times tree, plus read-only browsing of repair manuals and vehicle
// technical data for a chosen engine variant. Deep data is per-TYPE — the
// picker swaps the variant.
//
// Toggles have two scopes (Task 23): "This model only" (the default) and "All
// vehicles" (?scope=global). A node hidden for all vehicles shows a lock on a
// model page but its toggle stays live — switching it on there writes a
// per-model override rather than touching the global hide.

export const dynamic = "force-dynamic";

const TABS = [
  { key: "repairs", label: "Repair times", icon: Clock },
  { key: "manuals", label: "Manuals", icon: BookOpen },
  { key: "data", label: "Technical data", icon: ClipboardList },
] as const;

type TabKey = (typeof TABS)[number]["key"];

interface ModelPageProps {
  params: Promise<{ makeId: string; modelId: string }>;
  searchParams: Promise<{
    type?: string;
    tab?: string;
    /** "global" = toggles apply to every vehicle; absent = this model only. */
    scope?: string;
    node?: string;
    crumbs?: string;
    story?: string;
  }>;
}

export default async function AdminVehicleModelPage({
  params,
  searchParams,
}: ModelPageProps) {
  const [{ makeId, modelId }, query] = await Promise.all([params, searchParams]);
  const modelIdNum = Number.parseInt(modelId, 10);
  if (!Number.isFinite(modelIdNum)) notFound();

  const model = await getModelWithTypes(modelIdNum);
  if (!model?.name) notFound();

  const types = (model.subElements ?? []).filter(
    (t): t is HpTreeNode & { id: number } => t.id != null,
  );
  const requestedType = Number.parseInt(query.type ?? "", 10);
  const selectedType =
    types.find((t) => t.id === requestedType) ?? types[0] ?? null;

  const tab: TabKey = (TABS.find((t) => t.key === query.tab)?.key ??
    "repairs") as TabKey;
  const scope: ExclusionScope = query.scope === "global" ? "global" : "model";

  // "VOLKSWAGEN Golf IV (1J1…)" minus the model name = the make name — the
  // exclusion keys (Stage D) that the booking-funnel matcher compares against.
  const makeName = (model.fullName ?? "")
    .replace(model.name, "")
    .trim()
    .toUpperCase();
  const modelName = model.name;

  const base = `/admin/vehicles/${makeId}/${modelId}`;
  const tabHref = (key: TabKey) =>
    `${base}?tab=${key}${selectedType ? `&type=${selectedType.id}` : ""}`;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/vehicles/${makeId}`}
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-text-secondary hover:bg-surface"
            aria-label="Back to models"
          >
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-4">
            {model.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={model.image}
                alt=""
                className="hidden h-16 w-auto object-contain sm:block"
              />
            )}
            <div>
              <Overline>Vehicles</Overline>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-text-primary">
                {model.fullName ?? model.name}
              </h1>
              <p className="mt-0.5 text-sm text-text-muted">
                {model.madeFrom ?? "?"} – {model.madeUntil ?? "now"} ·{" "}
                {types.length} engine variant{types.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
        </div>

        {selectedType && (
          <TypePicker
            value={String(selectedType.id)}
            options={types.map((t) => ({
              value: String(t.id),
              label: typeLabel(t),
            }))}
          />
        )}
      </header>

      {/* Tabs */}
      <nav className="flex flex-wrap gap-2 border-b border-border pb-px">
        {TABS.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={tabHref(key)}
            className={cn(
              "flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              tab === key
                ? "border-brand-blue text-brand-blue"
                : "border-transparent text-text-secondary hover:text-text-primary",
            )}
          >
            <Icon size={15} />
            {label}
          </Link>
        ))}
      </nav>

      {!selectedType ? (
        <div className="rounded-button border border-border bg-surface-card px-4 py-8 text-center text-sm text-text-muted">
          No engine variants found for this model.
        </div>
      ) : tab === "repairs" ? (
        <RepairsPanel
          carTypeId={selectedType.id}
          makeName={makeName}
          modelName={modelName}
          base={base}
          typeParam={String(selectedType.id)}
          nodeId={query.node ?? "root"}
          crumbs={query.crumbs ?? ""}
          scope={scope}
        />
      ) : tab === "manuals" ? (
        <ManualsPanel
          carTypeId={selectedType.id}
          base={base}
          typeParam={String(selectedType.id)}
          storyId={query.story}
        />
      ) : (
        <DataPanel carTypeId={selectedType.id} />
      )}
    </div>
  );
}

function typeLabel(t: HpTreeNode): string {
  const fuel = Array.isArray(t.fuelType) ? t.fuelType.join("/") : t.fuelType;
  return [
    t.name,
    t.engineCode,
    t.capacity ? `${t.capacity}cc` : null,
    fuel,
    `${t.madeFrom ?? "?"}–${t.madeUntil ?? "now"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

function fmtHours(n: number): string {
  return `${Number(n.toFixed(2))}h`;
}

// ---------------------------------------------------------------------------
// Repair times — tree browse with availability toggles (model / all vehicles).
// ---------------------------------------------------------------------------

/** The small caption under a node explaining a state its toggle alone can't. */
function availabilityNote(
  availability: NodeAvailability,
  globalScope: boolean,
): { text: string; lock?: boolean } | null {
  if (globalScope) {
    if (availability === "shown_override") return { text: "Shown for this model (override)" };
    if (availability === "hidden_model") return { text: "Hidden for this model" };
    return null;
  }
  switch (availability) {
    case "hidden_global":
      return { text: "Hidden for all vehicles", lock: true };
    case "shown_override":
      return { text: "Shown for this model · hidden elsewhere" };
    case "hidden_model":
      return { text: "Hidden from customers" };
    default:
      return null;
  }
}

async function RepairsPanel({
  carTypeId,
  makeName,
  modelName,
  base,
  typeParam,
  nodeId,
  crumbs,
  scope,
}: {
  carTypeId: number;
  makeName: string;
  modelName: string;
  base: string;
  typeParam: string;
  nodeId: string;
  crumbs: string;
  scope: ExclusionScope;
}) {
  const repairtimeTypeId = await getRepairtimeTypeId(carTypeId);
  if (repairtimeTypeId == null) {
    return (
      <div className="rounded-button border border-border bg-surface-card px-4 py-8 text-center text-sm text-text-muted">
        HaynesPro has no repair-times coverage for this variant.
      </div>
    );
  }

  const supabase = await createClient();
  // The whole (small) table, partitioned in memory by the same rule the
  // funnel applies — so this page and the customer browser can't disagree.
  const [nodes, { data: exclusionRows }] = await Promise.all([
    getRepairtimeSubnodes(repairtimeTypeId, nodeId),
    supabase.from("repair_vehicle_exclusions").select("*"),
  ]);
  const state = exclusionStateForModel(
    (exclusionRows ?? []) as RepairExclusionRow[],
    makeName,
    modelName,
  );
  const global = scope === "global";
  const scopeParam = global ? "&scope=global" : "";
  const target: ExclusionTarget = global
    ? { scope: "global" }
    : { scope: "model", makeName, modelName };
  // What the toggle shows: in model scope the effective state for THIS model
  // (overrides included); in global scope only the global hide itself.
  const visibleFor = (id: string) =>
    global ? !state.globalHidden.has(id) : isNodeVisible(nodeAvailability(id, state));
  // Groups render as an icon-tile grid (same treatment as the brand grid);
  // timed leaf repairs keep the hours + toggle list below.
  const groups = nodes.filter((n) => n.id != null && n.hasSubnodes);
  const leaves = nodes.filter((n) => n.id != null && !n.hasSubnodes);
  // crumbs = "id~label|id~label" trail down to the current node.
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
    return `${base}?tab=repairs&type=${typeParam}&node=${encodeURIComponent(id)}&crumbs=${encodeURIComponent(nextCrumbs)}${scopeParam}`;
  };
  const crumbHref = (index: number) => {
    if (index < 0) return `${base}?tab=repairs&type=${typeParam}${scopeParam}`;
    const upto = trail.slice(0, index + 1);
    return `${base}?tab=repairs&type=${typeParam}&node=${encodeURIComponent(upto[index].id)}&crumbs=${encodeURIComponent(upto.map((c) => `${c.id}~${c.label}`).join("|"))}${scopeParam}`;
  };

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
        <div className="flex shrink-0 items-center gap-2 text-sm text-text-secondary">
          <span>Apply changes to</span>
          <ScopePicker value={scope} />
        </div>
      </div>

      {global && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You&apos;re editing the list for{" "}
          <span className="font-semibold">every vehicle</span>. Anything switched
          off here disappears for all makes and models — a model page can still
          switch it back on for that model alone.{" "}
          <Link href="/admin/vehicles/hidden" className="font-semibold underline">
            Review what&apos;s hidden
          </Link>
        </div>
      )}

      {nodes.length === 0 && (
        <p className="rounded-2xl border border-border bg-surface-card px-4 py-8 text-center text-sm text-text-muted shadow-card">
          Nothing under this group.
        </p>
      )}

      {/* Sub-groups — compact rows: icon left, label left, drill-in chevron.
          The availability tick is always visible: filled blue = bookable,
          empty ring = hidden (row also greys out). */}
      {groups.length > 0 && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {groups.map((node) => {
            const id = node.id as string;
            const visible = visibleFor(id);
            const note = availabilityNote(nodeAvailability(id, state), global);
            const GroupIcon = repairGroupIcon(node.description);
            return (
              <div
                key={id}
                className={cn(
                  "relative rounded-xl border border-border bg-surface-card shadow-card transition-colors hover:border-brand-blue/40",
                  !visible && "opacity-60",
                )}
              >
                <span className="absolute right-8 top-1/2 z-10 -translate-y-1/2">
                  <RepairToggle
                    target={target}
                    nodeId={id}
                    description={node.description}
                    initialAvailable={visible}
                  />
                </span>
                <Link
                  href={nodeHref(id, node.description ?? id)}
                  className="flex items-center gap-2.5 py-2.5 pl-2.5 pr-14"
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg",
                      visible ? "bg-blue-50" : "bg-surface",
                    )}
                  >
                    <GroupIcon
                      size={16}
                      className={visible ? "text-brand-blue" : "text-text-muted"}
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span
                      className={cn(
                        "truncate text-sm font-semibold",
                        visible ? "text-text-primary" : "text-text-muted",
                      )}
                      title={node.description ?? undefined}
                    >
                      {node.description}
                    </span>
                    {note && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-text-muted">
                        {note.lock && <Lock size={10} />}
                        {note.text}
                      </span>
                    )}
                  </span>
                  <ChevronRight
                    size={14}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted"
                  />
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {/* Timed leaf repairs — hours + availability toggle. */}
      {leaves.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-border bg-surface-card shadow-card">
          {groups.length > 0 && (
            <p className="border-b border-border-subtle bg-surface px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
              Timed repairs
            </p>
          )}
          <ul className="divide-y divide-border-subtle">
            {leaves.map((node) => {
              const id = node.id as string;
              const visible = visibleFor(id);
              const note = availabilityNote(nodeAvailability(id, state), global);
              return (
                <li key={id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span
                    className={cn(
                      "min-w-0 flex-1",
                      visible ? "text-text-secondary" : "text-text-muted",
                    )}
                  >
                    {node.description}
                    {note && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-text-muted">
                        {note.lock && <Lock size={10} />}
                        {note.text}
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-semibold",
                      visible ? "text-text-primary" : "text-text-muted",
                    )}
                  >
                    {typeof node.value === "number" && node.value > 0
                      ? fmtHours(node.value / 100)
                      : "—"}
                  </span>
                  <RepairToggle
                    target={target}
                    nodeId={id}
                    description={node.description}
                    initialAvailable={visible}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="text-xs text-text-muted">
        {global
          ? "Switching a repair or group off here hides it for every make and model. A model page can still switch it back on for that model alone. Hiding a group hides everything inside it."
          : "Switching a repair or group off hides it from the customer “Repairs for your car” browser for every variant of this model. Hiding a group hides everything inside it. A repair hidden for all vehicles can be switched back on here — for this model only."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Manuals — story list + story viewer.
// ---------------------------------------------------------------------------

async function ManualsPanel({
  carTypeId,
  base,
  typeParam,
  storyId,
}: {
  carTypeId: number;
  base: string;
  typeParam: string;
  storyId?: string;
}) {
  const storyIdNum = Number.parseInt(storyId ?? "", 10);
  if (Number.isFinite(storyIdNum)) {
    const story = await getStory(carTypeId, storyIdNum);
    return (
      <div className="space-y-4">
        <Link
          href={`${base}?tab=manuals&type=${typeParam}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-blue hover:underline"
        >
          <ArrowLeft size={14} /> All manuals
        </Link>
        {!story ? (
          <p className="rounded-button border border-border bg-surface-card px-4 py-8 text-center text-sm text-text-muted">
            Couldn&apos;t load this manual.
          </p>
        ) : (
          <article className="rounded-2xl border border-border bg-surface-card p-6 shadow-card">
            <h2 className="text-xl font-bold text-text-primary">{story.name}</h2>
            <div className="mt-4 space-y-3">
              {(story.storyLines ?? []).map((line, i) => (
                <StoryLineView key={i} line={line} depth={0} />
              ))}
            </div>
          </article>
        )}
      </div>
    );
  }

  const stories = await getStoryList(carTypeId);
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface-card shadow-card">
      {stories.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-text-muted">
          No repair manuals available for this variant.
        </p>
      )}
      <ul className="divide-y divide-border-subtle">
        {stories.map((story) => (
          <li key={story.storyId}>
            <Link
              href={`${base}?tab=manuals&type=${typeParam}&story=${story.storyId}`}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-text-primary transition-colors hover:bg-surface"
            >
              {story.name}
              <span className="text-xs font-normal text-text-muted">Read ›</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StoryLineView({ line, depth }: { line: HpStoryLine; depth: number }) {
  const hasChildren = (line.subStoryLines ?? []).length > 0;
  const image = line.mimeData?.mimeDataName;
  return (
    <div className={cn(depth > 0 && "ml-4 border-l border-border-subtle pl-4")}>
      {line.name && (
        <p
          className={cn(
            "text-sm leading-relaxed",
            hasChildren ? "font-semibold text-text-primary" : "text-text-secondary",
          )}
        >
          {line.name}
        </p>
      )}
      {line.paragraphContent && (
        <p className="mt-1 text-sm leading-relaxed text-text-secondary">
          {line.paragraphContent}
        </p>
      )}
      {line.remark && (
        <p className="mt-1 text-xs italic text-text-muted">{line.remark}</p>
      )}
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          loading="lazy"
          className="mt-2 max-h-80 w-auto max-w-full rounded-lg border border-border-subtle bg-white p-2"
        />
      )}
      {hasChildren && (
        <div className="mt-2 space-y-2">
          {(line.subStoryLines ?? []).map((sub, i) => (
            <StoryLineView key={i} line={sub} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Technical data — adjustments, capacities, ID locations.
// ---------------------------------------------------------------------------

async function DataPanel({ carTypeId }: { carTypeId: number }) {
  const [adjustments, capacities, idLocations] = await Promise.all([
    getAdjustments(carTypeId),
    getCapacities(carTypeId),
    getIdLocations(carTypeId),
  ]);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-lg font-bold text-text-primary">
          Adjustments &amp; specifications
        </h2>
        {adjustments.length === 0 ? (
          <p className="rounded-button border border-border bg-surface-card px-4 py-6 text-center text-sm text-text-muted">
            No adjustment data for this variant.
          </p>
        ) : (
          <div className="space-y-2">
            {adjustments.map((group, i) => (
              <details
                key={i}
                className="group rounded-2xl border border-border bg-surface-card shadow-card"
              >
                <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-text-primary">
                  {group.name}
                </summary>
                <div className="border-t border-border-subtle px-4 py-3">
                  <AdjustmentRows rows={group.subAdjustments ?? []} depth={0} />
                </div>
              </details>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold text-text-primary">Capacities</h2>
        {capacities.length === 0 ? (
          <p className="rounded-button border border-border bg-surface-card px-4 py-6 text-center text-sm text-text-muted">
            No capacity data for this variant.
          </p>
        ) : (
          <div className="rounded-2xl border border-border bg-surface-card px-4 py-3 shadow-card">
            {capacities.map((group, i) => (
              <AdjustmentRows key={i} rows={group.subAdjustments ?? []} depth={0} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold text-text-primary">
          VIN &amp; ID plate locations
        </h2>
        {idLocations.length === 0 ? (
          <p className="rounded-button border border-border bg-surface-card px-4 py-6 text-center text-sm text-text-muted">
            No ID-location data for this variant.
          </p>
        ) : (
          idLocations.map((loc, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border bg-surface-card p-4 shadow-card"
            >
              <div className="space-y-3">
                {(loc.storyLines ?? []).map((line, j) => (
                  <StoryLineView key={j} line={line} depth={0} />
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function AdjustmentRows({ rows, depth }: { rows: HpAdjustment[]; depth: number }) {
  return (
    <div className={cn(depth > 0 && "ml-4")}>
      {rows.map((row, i) => {
        const hasChildren = (row.subAdjustments ?? []).length > 0;
        return (
          <div key={i} className="py-1">
            {hasChildren ? (
              <>
                <p className="pt-1 text-sm font-semibold text-text-primary">{row.name}</p>
                <AdjustmentRows rows={row.subAdjustments ?? []} depth={depth + 1} />
              </>
            ) : (
              <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="text-text-secondary">{row.name}</span>
                <span className="shrink-0 font-medium text-text-primary">
                  {row.value ?? "—"}
                  {row.unit ? ` ${row.unit}` : ""}
                </span>
              </div>
            )}
            {row.remark && <p className="text-xs italic text-text-muted">{row.remark}</p>}
          </div>
        );
      })}
    </div>
  );
}
