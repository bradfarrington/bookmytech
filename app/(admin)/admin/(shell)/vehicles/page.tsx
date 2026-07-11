import { Overline } from "@/components/ui/overline";
import { isHaynesProConfigured } from "@/lib/haynespro/client";
import { brandLogoSlug, getMakes } from "@/lib/haynespro/tree";
import { BrandTile } from "./_components/brand-tile";

// Admin Vehicles area (Task 16 Stage E): browse every car make HaynesPro
// covers, drill into models and engine variants, and manage per-model service
// availability + eyeball the technical data behind vehicle-specific pricing.

export const dynamic = "force-dynamic";

export default async function AdminVehiclesPage() {
  const configured = isHaynesProConfigured();
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
          which services are bookable on it, check the OEM repair times behind
          vehicle-specific pricing, and browse manuals and technical data.
        </p>
      </header>

      {!configured && (
        <div className="rounded-button border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          HaynesPro isn&apos;t configured — add the <code>HAYNESPRO_*</code>{" "}
          values to the environment to enable this area.
        </div>
      )}

      {configured && makes.length === 0 && (
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
