// UK postcode geocoding via postcodes.io — a free, open, no-key API.
// Used by dispatch (to test whether a job address falls inside a mechanic's
// service radius) and by the mechanic dashboard (distance labels, map centre).
//
// Postcodes don't move, so we cache lookups for the life of the server process.
// A null result (invalid / unknown postcode) is cached too, so we don't re-hit
// the API for the same bad input.

export interface LatLng {
  lat: number;
  lng: number;
}

const cache = new Map<string, LatLng | null>();

function normalise(postcode: string): string {
  return postcode.replace(/\s+/g, "").toUpperCase();
}

/** Outward code (district) — "SE15 5DT" → "SE15". Used as a coarse fallback
 *  when geocoding is unavailable. Mirrors derive_postcode_district() in SQL. */
export function outwardCode(postcode: string): string {
  const trimmed = postcode.trim().toUpperCase();
  const spaceIdx = trimmed.indexOf(" ");
  if (spaceIdx > 0) return trimmed.slice(0, spaceIdx);
  // No space — strip the last 3 chars (inward code) if it looks full.
  return trimmed.length > 3 ? trimmed.slice(0, trimmed.length - 3) : trimmed;
}

export async function geocodePostcode(
  postcode: string | null | undefined,
): Promise<LatLng | null> {
  if (!postcode) return null;
  const key = normalise(postcode);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  try {
    const res = await fetch(
      `https://api.postcodes.io/postcodes/${encodeURIComponent(key)}`,
      // Postcode coordinates are static — let the platform cache the response.
      { next: { revalidate: 60 * 60 * 24 * 30 } },
    );
    if (!res.ok) {
      cache.set(key, null);
      return null;
    }
    const json = (await res.json()) as {
      result?: { latitude?: number; longitude?: number };
    };
    const r = json.result;
    if (typeof r?.latitude !== "number" || typeof r?.longitude !== "number") {
      cache.set(key, null);
      return null;
    }
    const coords: LatLng = { lat: r.latitude, lng: r.longitude };
    cache.set(key, coords);
    return coords;
  } catch {
    // Network error — don't cache so a later call can retry.
    return null;
  }
}

const EARTH_RADIUS_MILES = 3958.8;

/** Great-circle distance between two points in miles. */
export function haversineMiles(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.asin(Math.sqrt(h));
}
