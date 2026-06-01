// Tiny equirectangular projection for the service-area map. Good enough for a
// few-mile radius where the earth is effectively flat. Converts a lat/lng into
// a miles offset (north/east) from a base point, which the SVG map then scales
// to pixels.
//
// This keeps the map provider-agnostic and free: today it backs an inline SVG
// (no API key, no billing). A real Google Maps / Leaflet layer can replace the
// SVG later without touching dispatch or the geocoding cache (lib/geo).

import type { LatLng } from "@/lib/geo/postcodes";

const MILES_PER_DEG_LAT = 69.0;

export interface MilesOffset {
  /** Miles north of base (negative = south). */
  north: number;
  /** Miles east of base (negative = west). */
  east: number;
}

export function offsetMiles(base: LatLng, point: LatLng): MilesOffset {
  const north = (point.lat - base.lat) * MILES_PER_DEG_LAT;
  const east =
    (point.lng - base.lng) *
    MILES_PER_DEG_LAT *
    Math.cos((base.lat * Math.PI) / 180);
  return { north, east };
}

export function distanceMiles(base: LatLng, point: LatLng): number {
  const { north, east } = offsetMiles(base, point);
  return Math.sqrt(north * north + east * east);
}
