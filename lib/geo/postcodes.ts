// UK postcode geocoding via postcodes.io — a free, open, no-key API.
// Used by dispatch (to test whether a job address falls inside a mechanic's
// service radius) and by the mechanic dashboard (distance labels, map centre).
//
// Two shapes of input reach us:
//   • a full postcode ("NG10 1AA") → /postcodes/{code}, the exact point
//   • an outward code / district only ("NG10") → /outcodes/{code}, the
//     district centroid. Admins may set a mechanic's base as just a district,
//     and customers sometimes type only the first half. The /postcodes/
//     endpoint 404s for these, so before this fallback existed an
//     outward-only postcode geocoded to null and dispatch dropped to an exact
//     same-district match — which is why B77 → B77 worked but NG10 → NG12
//     never did, even with the two districts well inside a 10-mile radius.
// A full postcode that postcodes.io doesn't know (typo in the inward half, a
// terminated code) also falls back to its district centroid rather than null.
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

// Outward code on its own: 1–2 letters, a digit, then an optional digit or
// letter ("B77", "NG10", "SW1A", "EC1"). Anything longer has an inward half.
const OUTWARD_ONLY_RE = /^[A-Z]{1,2}[0-9][A-Z0-9]?$/;

/** True when the input is just a district ("NG12"), not a full postcode. */
export function isOutwardOnly(postcode: string): boolean {
  return OUTWARD_ONLY_RE.test(normalise(postcode));
}

// Postcode coordinates are static — let the platform cache the response.
const FETCH_OPTS = { next: { revalidate: 60 * 60 * 24 * 30 } } as const;

type Outcome = { coords: LatLng | null; networkError: boolean };

async function lookup(path: string): Promise<Outcome> {
  try {
    const res = await fetch(`https://api.postcodes.io/${path}`, FETCH_OPTS);
    if (!res.ok) return { coords: null, networkError: false };
    const json = (await res.json()) as {
      result?: { latitude?: number; longitude?: number };
    };
    const r = json.result;
    if (typeof r?.latitude !== "number" || typeof r?.longitude !== "number") {
      return { coords: null, networkError: false };
    }
    return { coords: { lat: r.latitude, lng: r.longitude }, networkError: false };
  } catch {
    return { coords: null, networkError: true };
  }
}

async function lookupFull(key: string): Promise<Outcome> {
  return lookup(`postcodes/${encodeURIComponent(key)}`);
}

async function lookupOutcode(outcode: string): Promise<Outcome> {
  return lookup(`outcodes/${encodeURIComponent(outcode)}`);
}

export async function geocodePostcode(
  postcode: string | null | undefined,
): Promise<LatLng | null> {
  if (!postcode) return null;
  const key = normalise(postcode);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  let outcome: Outcome;
  if (isOutwardOnly(key)) {
    outcome = await lookupOutcode(key);
  } else {
    outcome = await lookupFull(key);
    // Unknown full postcode → settle for the district centre. Far better for
    // a radius check than nothing: a 10-mile radius dwarfs the error.
    if (!outcome.coords && !outcome.networkError) {
      const district = outwardCode(postcode);
      if (district && isOutwardOnly(district)) outcome = await lookupOutcode(district);
    }
  }

  // Network error — don't cache so a later call can retry.
  if (outcome.networkError) return null;
  cache.set(key, outcome.coords);
  return outcome.coords;
}

/** Test hook — the in-process cache would otherwise leak between cases. */
export function _resetGeocodeCache(): void {
  cache.clear();
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
