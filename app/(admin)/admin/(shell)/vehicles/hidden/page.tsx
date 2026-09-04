import Link from "next/link";
import { ArrowLeft, EyeOff } from "lucide-react";
import { Overline } from "@/components/ui/overline";
import {
  GLOBAL_SCOPE,
  isGlobalExclusionRow,
  type RepairExclusionRow,
} from "@/lib/haynespro/exclusions";
import { createAdminClient } from "@/lib/supabase/admin";
import { ShowAgainButton } from "../_components/show-again-button";

// Review page for everything switched off (Task 23). The model pages are where
// hides get written, one node at a time while browsing a tree; this is the one
// place that lists the result — every repair hidden for all vehicles (with the
// models that override it), then the per-model hides — so the admin can see
// what customers can't, and put it back.

export const dynamic = "force-dynamic";

interface HiddenRow extends RepairExclusionRow {
  id: string;
  description: string | null;
  created_at: string;
}

function since(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function modelLabel(row: Pick<RepairExclusionRow, "make_name" | "model_name">): string {
  return `${row.make_name} ${row.model_name}`;
}

export default async function AdminHiddenRepairsPage() {
  const { data } = await createAdminClient()
    .from("repair_vehicle_exclusions")
    .select("*")
    .order("description", { ascending: true });
  const rows = (data ?? []) as HiddenRow[];

  const globalHides = rows.filter((r) => isGlobalExclusionRow(r) && r.mode !== "show");
  const overridesByNode = new Map<string, string[]>();
  const modelHides = new Map<string, HiddenRow[]>();
  for (const row of rows) {
    if (isGlobalExclusionRow(row)) continue;
    if (row.mode === "show") {
      const list = overridesByNode.get(row.node_id) ?? [];
      list.push(modelLabel(row));
      overridesByNode.set(row.node_id, list);
    } else {
      const key = modelLabel(row);
      const list = modelHides.get(key) ?? [];
      list.push(row);
      modelHides.set(key, list);
    }
  }
  const modelGroups = [...modelHides.entries()].sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <Link
          href="/admin/vehicles"
          className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-text-secondary hover:bg-surface"
          aria-label="Back to vehicles"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <Overline>Vehicles</Overline>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
            Hidden repairs
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            {globalHides.length} hidden for all vehicles ·{" "}
            {modelGroups.reduce((n, [, list]) => n + list.length, 0)} hidden on
            specific models
          </p>
        </div>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">
          Hidden for all vehicles
        </h2>
        {globalHides.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface-card px-4 py-10 text-center">
            <EyeOff size={22} className="mx-auto text-text-muted" />
            <p className="mt-3 text-sm font-semibold text-text-primary">
              Nothing is hidden for all vehicles
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">
              Open any model&apos;s Repair times tab, set &ldquo;Apply changes
              to&rdquo; to All vehicles, and switch off the groups and repairs
              you never do. They&apos;ll be listed here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border-subtle overflow-hidden rounded-2xl border border-border bg-surface-card shadow-card">
            {globalHides.map((row) => {
              const overrides = overridesByNode.get(row.node_id) ?? [];
              const label = row.description?.trim() || row.node_id;
              return (
                <li key={row.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-text-primary">{label}</p>
                    <p className="mt-0.5 text-xs text-text-muted">
                      <span className="font-mono">{row.node_id}</span> · since{" "}
                      {since(row.created_at)}
                    </p>
                    {overrides.length > 0 && (
                      <p className="mt-1 text-xs text-brand-blue">
                        Shown on: {overrides.sort().join(", ")}
                      </p>
                    )}
                  </div>
                  <ShowAgainButton
                    target={{ scope: "global" }}
                    nodeId={row.node_id}
                    label={label}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {modelGroups.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-text-muted">
            Hidden on specific models
          </h2>
          <div className="space-y-3">
            {modelGroups.map(([label, list]) => (
              <div
                key={label}
                className="overflow-hidden rounded-2xl border border-border bg-surface-card shadow-card"
              >
                <p className="border-b border-border-subtle bg-surface px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  {label}
                </p>
                <ul className="divide-y divide-border-subtle">
                  {list.map((row) => {
                    const name = row.description?.trim() || row.node_id;
                    return (
                      <li key={row.id} className="flex items-center gap-4 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text-primary">{name}</p>
                          <p className="mt-0.5 text-xs text-text-muted">
                            <span className="font-mono">{row.node_id}</span> · since{" "}
                            {since(row.created_at)}
                          </p>
                        </div>
                        <ShowAgainButton
                          target={{
                            scope: "model",
                            makeName: row.make_name,
                            modelName: row.model_name,
                          }}
                          nodeId={row.node_id}
                          label={name}
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-text-muted">
        A global hide keys on the HaynesPro repair id ({GLOBAL_SCOPE} scope), which
        means the same job on every make. &ldquo;Shown on&rdquo; lists the models
        whose own page switched that repair back on.
      </p>
    </div>
  );
}
