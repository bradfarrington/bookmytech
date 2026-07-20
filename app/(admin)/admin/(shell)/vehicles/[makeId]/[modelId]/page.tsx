import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, ClipboardList, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { Overline } from "@/components/ui/overline";
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
import { repairGroupIcon } from "@/lib/repair-group-icons";
import { RepairToggle } from "../../_components/repair-toggle";
import { TypePicker } from "../../_components/type-picker";

// Admin model page (Task 16 Stage E): per-model repair availability toggles
// over the repair-times tree, plus read-only browsing of repair manuals and
// vehicle technical data for a chosen engine variant. Deep data is per-TYPE —
// the picker swaps the variant.

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
// Repair times — tree browse with per-model availability toggles.
// ---------------------------------------------------------------------------

async function RepairsPanel({
  carTypeId,
  makeName,
  modelName,
  base,
  typeParam,
  nodeId,
  crumbs,
}: {
  carTypeId: number;
  makeName: string;
  modelName: string;
  base: string;
  typeParam: string;
  nodeId: string;
  crumbs: string;
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
  const [nodes, { data: exclusionRows }] = await Promise.all([
    getRepairtimeSubnodes(repairtimeTypeId, nodeId),
    supabase
      .from("repair_vehicle_exclusions")
      .select("node_id")
      .eq("make_name", makeName)
      .eq("model_name", modelName),
  ]);
  const excluded = new Set((exclusionRows ?? []).map((r) => r.node_id));
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
    return `${base}?tab=repairs&type=${typeParam}&node=${encodeURIComponent(id)}&crumbs=${encodeURIComponent(nextCrumbs)}`;
  };
  const crumbHref = (index: number) => {
    if (index < 0) return `${base}?tab=repairs&type=${typeParam}`;
    const upto = trail.slice(0, index + 1);
    return `${base}?tab=repairs&type=${typeParam}&node=${encodeURIComponent(upto[index].id)}&crumbs=${encodeURIComponent(upto.map((c) => `${c.id}~${c.label}`).join("|"))}`;
  };

  return (
    <div className="space-y-4">
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

      {nodes.length === 0 && (
        <p className="rounded-2xl border border-border bg-surface-card px-4 py-8 text-center text-sm text-text-muted shadow-card">
          Nothing under this group.
        </p>
      )}

      {/* Sub-groups — icon tiles, same density as the brand grid. */}
      {groups.length > 0 && (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
          {groups.map((node) => {
            const id = node.id as string;
            const hidden = excluded.has(id);
            const GroupIcon = repairGroupIcon(node.description);
            return (
              <div
                key={id}
                className={cn(
                  "relative rounded-2xl border border-border bg-surface-card shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-blue/40 hover:shadow-md",
                  hidden && "opacity-60",
                )}
              >
                <div className="absolute right-2 top-2 z-10">
                  <RepairToggle
                    makeName={makeName}
                    modelName={modelName}
                    nodeId={id}
                    description={node.description}
                    initialAvailable={!hidden}
                  />
                </div>
                <Link
                  href={nodeHref(id, node.description ?? id)}
                  className="flex h-full flex-col items-center gap-2 p-3 pt-7 text-center"
                >
                  <span
                    className={cn(
                      "flex size-10 items-center justify-center rounded-xl",
                      hidden ? "bg-surface" : "bg-blue-50",
                    )}
                  >
                    <GroupIcon
                      size={18}
                      className={hidden ? "text-text-muted" : "text-brand-blue"}
                    />
                  </span>
                  <span
                    className={cn(
                      "text-xs font-semibold leading-tight",
                      hidden ? "text-text-muted" : "text-text-primary",
                    )}
                  >
                    {node.description}
                  </span>
                  {hidden && (
                    <span className="text-[10px] font-medium text-text-muted">
                      Hidden from customers
                    </span>
                  )}
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
              const hidden = excluded.has(id);
              return (
                <li key={id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span
                    className={cn(
                      "min-w-0 flex-1",
                      hidden ? "text-text-muted" : "text-text-secondary",
                    )}
                  >
                    {node.description}
                    {hidden && (
                      <span className="ml-2 text-[11px] font-medium text-text-muted">
                        Hidden from customers
                      </span>
                    )}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-semibold",
                      hidden ? "text-text-muted" : "text-text-primary",
                    )}
                  >
                    {typeof node.value === "number" && node.value > 0
                      ? fmtHours(node.value / 100)
                      : "—"}
                  </span>
                  <RepairToggle
                    makeName={makeName}
                    modelName={modelName}
                    nodeId={id}
                    description={node.description}
                    initialAvailable={!hidden}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <p className="text-xs text-text-muted">
        Switching a repair or group off hides it from the customer
        &ldquo;Repairs for your car&rdquo; browser for every variant of this
        model. Hiding a group hides everything inside it.
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
