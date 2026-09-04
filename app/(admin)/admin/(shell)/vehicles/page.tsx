import Link from "next/link";
import { ChevronRight, EyeOff } from "lucide-react";
import { Overline } from "@/components/ui/overline";
import { isHaynesProConfigured } from "@/lib/haynespro/client";
import { GLOBAL_SCOPE } from "@/lib/haynespro/exclusions";
import { readHaynesProHealth } from "@/lib/haynespro/health";
import { brandLogoSlug, getMakes } from "@/lib/haynespro/tree";
import { createAdminClient } from "@/lib/supabase/admin";
import { BrandTile } from "./_components/brand-tile";
import { HaynesProStatus } from "./_components/haynespro-status";

// Admin Vehicles area (Task 16 Stage E): browse every car make HaynesPro
// covers, drill into models and engine variants, and manage repair
// availability (per model, or for all vehicles — Task 23) + eyeball the
// technical data behind vehicle-specific pricing.

export const dynamic = "force-dynamic";

export default async function AdminVehiclesPage() {
  const configured = isHaynesProConfigured();
  const admin = createAdminClient();
  // Read health BEFORE the make list: getMakes() is itself a HaynesPro call, so
  // reading after it would show the state this page's own request just wrote —
  // fine, but it means a first load after an outage started reports "ok".
  const health = configured ? await readHaynesProHealth(admin) : null;
  const [makes, hidden] = await Promise.all([
    configured ? getMakes() : Promise.resolve([]),
    admin
      .from("repair_vehicle_exclusions")
      .select("id", { count: "exact", head: true })
      .eq("make_name", GLOBAL_SCOPE)
      .eq("model_name", GLOBAL_SCOPE),
  ]);
  const hiddenCount = hidden.count ?? 0;

  return (
    <div className="space-y-6">
      <header>
        <Overline>Commercial</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
          Vehicles
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
          Every car make covered by HaynesPro. Drill into a model to toggle
          which repairs are bookable — on that model, or on every vehicle at
          once — check the OEM repair times behind vehicle-specific pricing,
          and browse manuals and technical data.
        </p>
      </header>

      <HaynesProStatus configured={configured} health={health} />

      <Link
        href="/admin/vehicles/hidden"
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
              ? "Open a model, set “Apply changes to” to All vehicles, and switch off what you never do."
              : "Review the list, see which models override it, or show something again."}
          </span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-text-muted" />
      </Link>

      {configured && makes.length === 0 && health?.state !== "auth_failed" && (
        <div className="rounded-button border border-border bg-surface-card px-4 py-8 text-center text-sm text-text-muted">
          Couldn&apos;t load the make list from HaynesPro. Try again shortly.
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {makes.map((make) =>
          make.id == null || !make.name ? null : (
            <BrandTile
              key={make.id}
              href={`/admin/vehicles/${make.id}`}
              name={make.name}
              logoSlug={brandLogoSlug(make.name)}
            />
          ),
        )}
      </div>
    </div>
  );
}
