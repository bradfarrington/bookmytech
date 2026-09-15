import "server-only";
import { geocodePostcode, haversineMiles, outwardCode, type LatLng } from "@/lib/geo/postcodes";

// Who could take a job at a postcode: the two checks dispatch makes on every
// mechanic, shared with the per-window availability count (Task 54) so the
// count and the offers that follow a booking can't disagree about coverage.

export interface CoverageMechanic {
  base_postcode: string | null;
  service_radius_miles: number | null;
  is_suspended: boolean | null;
  suspended_until: string | null;
}

/** Suspended right now. A time-boxed suspension that has ended no longer counts. */
export function isSuspendedNow(mechanic: CoverageMechanic, nowMs: number = Date.now()): boolean {
  return (
    !!mechanic.is_suspended &&
    (!mechanic.suspended_until || new Date(mechanic.suspended_until).getTime() > nowMs)
  );
}

/** Where the job is: its coordinates when they geocode, and its district either way. */
export interface JobLocation {
  coords: LatLng | null;
  area: string;
}

/**
 * Whether the job falls inside the mechanic's service radius. Straight-line
 * distance between the two geocoded postcodes; when either can't be placed at
 * all, the coarse same-district match (strict: NG10 isn't NG12).
 */
export async function coversJob(
  mechanic: CoverageMechanic,
  job: JobLocation,
): Promise<{ inRange: boolean; usedFallback: boolean }> {
  if (!mechanic.base_postcode) return { inRange: false, usedFallback: false };
  const radius = mechanic.service_radius_miles ?? 10;

  if (job.coords) {
    const base = await geocodePostcode(mechanic.base_postcode);
    if (base) return { inRange: haversineMiles(job.coords, base) <= radius, usedFallback: false };
    return { inRange: outwardCode(mechanic.base_postcode) === job.area, usedFallback: true };
  }
  return { inRange: outwardCode(mechanic.base_postcode) === job.area, usedFallback: false };
}
