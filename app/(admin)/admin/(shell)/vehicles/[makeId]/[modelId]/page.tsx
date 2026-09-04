import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, ClipboardList, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Overline } from "@/components/ui/overline";
import { getModelWithTypes } from "@/lib/haynespro/tree";
import type { HpTreeNode } from "@/lib/haynespro/types";
import { DataPanel, ManualsPanel } from "@/components/haynespro/technical-panels";
import { RepairTreePanel } from "../../_components/repair-tree-panel";
import { TypePicker } from "../../_components/type-picker";

// Admin model page (Task 16 Stage E): repair availability toggles over the
// repair-times tree, plus read-only browsing of repair manuals and vehicle
// technical data for a chosen engine variant. Deep data is per-TYPE — the
// picker swaps the variant.
//
// Toggles here apply to THIS MODEL only (Task 23). Hides for every vehicle
// live under /admin/repairs; a node hidden there shows a lock on this page but
// its toggle stays live — switching it on writes a per-model override rather
// than touching the global hide.

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
        <RepairTreePanel
          carTypeId={selectedType.id}
          target={{ scope: "model", makeName, modelName }}
          linkBase={`${base}?tab=repairs&type=${selectedType.id}`}
          nodeId={query.node ?? "root"}
          crumbs={query.crumbs ?? ""}
        />
      ) : tab === "manuals" ? (
        <ManualsPanel
          carTypeId={selectedType.id}
          storyId={query.story}
          hrefs={{
            list: `${base}?tab=manuals&type=${selectedType.id}`,
            story: (id) => `${base}?tab=manuals&type=${selectedType.id}&story=${id}`,
          }}
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
