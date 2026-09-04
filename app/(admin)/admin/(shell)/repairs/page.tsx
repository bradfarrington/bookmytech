import Link from "next/link";
import { ChevronRight, EyeOff } from "lucide-react";
import { Overline } from "@/components/ui/overline";
import { isHaynesProConfigured } from "@/lib/haynespro/client";
import { GLOBAL_SCOPE } from "@/lib/haynespro/exclusions";
import { getReferenceVehicle } from "@/lib/haynespro/reference-vehicle";
import { getRepairtimeSubnodes, getRepairtimeTypeId } from "@/lib/haynespro/tree";
import { loadCatalogueOverlay } from "@/lib/catalogue/load-overlay";
import { customGroupId, displayName } from "@/lib/catalogue/overlay";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  RepairTreePanel,
  type CatalogueEditing,
} from "../vehicles/_components/repair-tree-panel";

// Admin Repairs (Tasks 23 + 26). One screen for the whole repair catalogue as
// customers see it: HaynesPro's tree with our names, categories and combined
// repairs over it. Switches here hide for EVERY vehicle; rename, move and
// combine act on the catalogue itself. The tree is HaynesPro's and therefore
// per vehicle, so it's browsed on a reference car type — any well-covered
// car, because a node id means the same job on every make (verified live,
// docs/tasks/23). A model's own page under Vehicles can still switch a
// globally hidden job back on for that model.

export const dynamic = "force-dynamic";

interface RepairsPageProps {
  searchParams: Promise<{
    node?: string;
    crumbs?: string;
  }>;
}

export default async function AdminRepairsPage({ searchParams }: RepairsPageProps) {
  const query = await searchParams;
  const admin = createAdminClient();
  const configured = isHaynesProConfigured();

  const [reference, overlay, hidden] = await Promise.all([
    getReferenceVehicle(admin),
    loadCatalogueOverlay(admin),
    admin
      .from("repair_vehicle_exclusions")
      .select("id", { count: "exact", head: true })
      .eq("make_name", GLOBAL_SCOPE)
      .eq("model_name", GLOBAL_SCOPE),
  ]);
  const hiddenCount = hidden.count ?? 0;

  // Where things can be moved to: the top level, HaynesPro's root groups (by
  // our names), and every category we created. Combined repairs a job can be
  // added to, likewise.
  let editing: CatalogueEditing = { destinations: [], bundleTargets: [] };
  if (configured) {
    const repairtimeTypeId = await getRepairtimeTypeId(reference.carTypeId);
    const rootGroups =
      repairtimeTypeId == null ? [] : await getRepairtimeSubnodes(repairtimeTypeId, "root");
    const destinations = [
      { value: "root", label: "Top level" },
      ...rootGroups
        .filter((n) => n.id != null && n.hasSubnodes)
        .map((n) => ({ value: n.id as string, label: displayName({ id: n.id as string, description: n.description }, overlay) })),
      ...overlay.groups.map((g) => ({ value: customGroupId(g.id), label: `${g.name} (your category)` })),
    ];
    const bundleTargets = overlay.bundles.map((bundle) => ({ value: bundle.id, label: bundle.name }));
    editing = { destinations, bundleTargets };
  }

  return (
    <div className="space-y-6">
      <header>
        <Overline>Commercial</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">Repairs</h1>
        <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
          Every repair customers can book. Switch off what you never do, rename groups and
          jobs, create your own categories and move things between them, and combine jobs into
          one bookable repair (the separate jobs stay too). Changes apply to every vehicle;
          to make an exception for one model, open it under Vehicles.
        </p>
      </header>

      <Link
        href="/admin/repairs/hidden"
        className="flex items-center gap-3 rounded-2xl border border-border bg-surface-card px-4 py-3 text-sm shadow-card transition-colors hover:border-brand-blue/40"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface">
          <EyeOff size={16} className="text-text-muted" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-semibold text-text-primary">
            {hiddenCount === 0
              ? "Nothing hidden for all vehicles yet"
              : `${hiddenCount} repair${hiddenCount === 1 ? "" : "s"} hidden for all vehicles`}
          </span>
          <span className="ml-2 text-text-muted">
            {hiddenCount === 0
              ? "Switch off what you never do below."
              : "Review the list, see which models override it, or show something again."}
          </span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-text-muted" />
      </Link>

      {!configured ? (
        <div className="rounded-button border border-border bg-surface-card px-4 py-8 text-center text-sm text-text-muted">
          HaynesPro isn&apos;t configured, so there is no repair list to browse.
        </div>
      ) : (
        <RepairTreePanel
          carTypeId={reference.carTypeId}
          target={{ scope: "global" }}
          linkBase="/admin/repairs?"
          nodeId={query.node ?? "root"}
          crumbs={query.crumbs ?? ""}
          editing={editing}
        />
      )}
    </div>
  );
}
