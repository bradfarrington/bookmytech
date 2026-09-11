import Link from "next/link";
import { Search } from "lucide-react";

import { isAagConfigured } from "@/lib/aag/client";
import { readAagHealth } from "@/lib/aag/health";
import { readAdsUsage } from "@/lib/lkq/ads-cache";
import { isLkqAdsConfigured, isLkqEcpConfigured, missingLkqEnv } from "@/lib/lkq/config";
import { readLkqHealth } from "@/lib/lkq/health";
import { createAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { Overline } from "@/components/ui/overline";
import { LiveLookupForm } from "./_components/live-lookup-form";
import { SupplierStatusStrip } from "./_components/supplier-status-strip";

// The parts catalogue (Task 42) — everything our suppliers list for a vehicle.
//
// The hand-maintained catalogue this route used to show was removed: parts now
// come from the supplier APIs only.
//
// Read-only: the page itself asks no supplier anything. Every lookup runs from
// an explicit button press in the form, because each one can spend a metered
// catalogue credit.

export const dynamic = "force-dynamic";

export default async function AdminPartsLookupPage() {
  const ecpConfigured = isLkqEcpConfigured();
  const adsConfigured = isLkqAdsConfigured();
  const aagConfigured = isAagConfigured();

  const db = createAdminClient();
  const [ecpHealth, adsHealth, aagHealth, usage] = await Promise.all([
    ecpConfigured ? readLkqHealth(db, "ecp") : Promise.resolve(null),
    adsConfigured ? readLkqHealth(db, "ads") : Promise.resolve(null),
    aagConfigured ? readAagHealth(db) : Promise.resolve(null),
    readAdsUsage(db),
  ]);

  const ready = ecpConfigured && adsConfigured;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Overline>Commercial</Overline>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
            Parts catalogue
          </h1>
          <p className="mt-1.5 max-w-2xl text-sm text-text-muted">
            Every part our suppliers list for a vehicle, with what each of them
            actually charges us today. Pick a registration, add the part types you
            want, then filter by brand or supplier. Costs are passed through at
            supplier price with no mark-up. Nothing here orders anything.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/parts/aag-check">
            <Button variant="ghost" iconLeft={Search}>
              AAG connection check
            </Button>
          </Link>
        </div>
      </header>

      <SupplierStatusStrip
        ecpConfigured={ecpConfigured}
        adsConfigured={adsConfigured}
        aagConfigured={aagConfigured}
        missing={missingLkqEnv()}
        ecpHealth={ecpHealth}
        adsHealth={adsHealth}
        aagHealth={aagHealth}
        credits={{ used: usage.used, cap: usage.cap }}
      />

      <LiveLookupForm disabled={!ready} />
    </div>
  );
}
