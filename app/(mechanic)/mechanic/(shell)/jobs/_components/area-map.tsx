"use client";

import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { LatLng } from "@/lib/geo/postcodes";

export interface AreaPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
}

export interface AreaMapProps {
  basePostcode: string | null;
  baseCoords: LatLng | null;
  radiusMiles: number;
  pins: AreaPin[];
  /** Count shown under the map (e.g. upcoming jobs in the area). */
  jobsInArea: number;
}

// Service-area card: a live OpenStreetMap map (Leaflet, free, no key) with a
// dashed radius circle around the mechanic's base and a pin per upcoming job.
// Leaflet needs `window`, so the map itself is a client-only chunk that loads
// after hydration; the placeholder keeps the card's height stable meanwhile.
const LeafletAreaMap = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => (
    <div
      className="h-64 w-full animate-pulse bg-gradient-to-br from-blue-100 to-blue-50"
      aria-hidden="true"
    />
  ),
});

export function AreaMap({
  basePostcode,
  baseCoords,
  radiusMiles,
  pins,
  jobsInArea,
}: AreaMapProps) {
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="bg-text-primary px-5 py-4 text-white">
        <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-white/60">
          Your service area
        </p>
        <p className="mt-1 text-lg font-bold">
          {basePostcode ? `${basePostcode} + ${radiusMiles} mi` : "Set your base postcode"}
        </p>
        <p className="mt-0.5 text-xs text-white/70">
          {jobsInArea} upcoming job{jobsInArea === 1 ? "" : "s"} in your radius
        </p>
      </div>

      {baseCoords ? (
        // `isolate` keeps Leaflet's internal z-indexes (panes go up to 1000)
        // from floating above the page's own overlays and dropdowns.
        <div className="relative isolate">
          <LeafletAreaMap base={baseCoords} radiusMiles={radiusMiles} pins={pins} />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <Icon icon={MapPin} size={22} className="text-text-muted" />
          <p className="text-sm font-semibold text-text-primary">
            No service area yet
          </p>
          <p className="max-w-xs text-xs text-text-muted">
            {basePostcode
              ? "We couldn't place that postcode on the map. Ask support to check it."
              : "Add your base postcode in Availability to see your radius and the jobs around you."}
          </p>
        </div>
      )}

      {baseCoords && (
        <div className="flex items-center justify-between px-4 py-3 text-xs text-text-secondary">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-success" /> Your jobs
          </span>
          <a
            href="/mechanic/availability"
            className="font-semibold text-brand-blue hover:underline"
          >
            Adjust radius
          </a>
        </div>
      )}
    </Card>
  );
}
