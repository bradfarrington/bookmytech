"use client";

import { MapPin } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { LatLng } from "@/lib/geo/postcodes";
import { offsetMiles } from "@/lib/maps/project";

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

// Inline SVG service-area map — free, no key, no billing. Renders a dashed
// radius circle around the mechanic's base and a pin per job, positioned by its
// real offset from base. A live Google/Leaflet map can replace this block later
// behind a GOOGLE_MAPS_API_KEY check; nothing else needs to change.
const VIEW = 320;
const CENTER = VIEW / 2;
const CIRCLE_R = 120; // px radius the service radius maps to

export function AreaMap({
  basePostcode,
  baseCoords,
  radiusMiles,
  pins,
  jobsInArea,
}: AreaMapProps) {
  const scale = CIRCLE_R / Math.max(1, radiusMiles); // px per mile

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
        <div className="relative bg-gradient-to-br from-blue-100 to-blue-50">
          <svg
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            className="h-52 w-full"
            role="img"
            aria-label="Map of your service area"
          >
            {/* radius circle */}
            <circle
              cx={CENTER}
              cy={CENTER}
              r={CIRCLE_R}
              fill="#2563EB"
              fillOpacity={0.12}
              stroke="#2563EB"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
            {/* base */}
            <circle cx={CENTER} cy={CENTER} r={6} fill="#2563EB" />
            {/* job pins */}
            {pins.map((pin) => {
              const { north, east } = offsetMiles(baseCoords, pin);
              let x = CENTER + east * scale;
              let y = CENTER - north * scale;
              // Keep stray pins inside the frame.
              x = Math.max(8, Math.min(VIEW - 8, x));
              y = Math.max(8, Math.min(VIEW - 8, y));
              return <circle key={pin.id} cx={x} cy={y} r={4.5} fill="#22C55E" />;
            })}
          </svg>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <Icon icon={MapPin} size={22} className="text-text-muted" />
          <p className="text-sm font-semibold text-text-primary">
            No service area yet
          </p>
          <p className="max-w-xs text-xs text-text-muted">
            Add your base postcode in Availability to see your radius and the
            jobs around you.
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
