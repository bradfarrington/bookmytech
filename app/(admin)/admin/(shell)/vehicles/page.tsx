import { Overline } from "@/components/ui/overline";
import { isHaynesProConfigured } from "@/lib/haynespro/client";
import { readHaynesProHealth } from "@/lib/haynespro/health";
import { brandLogoSlug, getMakes } from "@/lib/haynespro/tree";
import { createAdminClient } from "@/lib/supabase/admin";
import { BrandTile } from "./_components/brand-tile";
import { HaynesProStatus } from "./_components/haynespro-status";

// Admin Vehicles area (Task 16 Stage E): browse every car make HaynesPro
// covers, drill into models and engine variants, and manage per-model service
// availability + eyeball the technical data behind vehicle-specific pricing.

export const dynamic = "force-dynamic";

export default async function AdminVehiclesPage() {
  const configured = isHaynesProConfigured();
  // Read health BEFORE the make list: getMakes() is itself a HaynesPro call, so
  // reading after it would show the state this page's own request just wrote —
  // fine, but it means a first load after an outage started reports "ok".
  const health = configured ? await readHaynesProHealth(createAdminClient()) : null;
  const makes = configured ? await getMakes() : [];

  return (
    <div className="space-y-6">
      <header>
        <Overline>Commercial</Overline>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
          Vehicles
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
          Every car make covered by HaynesPro. Drill into a model to toggle
          which repairs are bookable on it, check the OEM repair times behind
          vehicle-specific pricing, and browse manuals and technical data.
        </p>
      </header>

      <HaynesProStatus configured={configured} health={health} />

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
