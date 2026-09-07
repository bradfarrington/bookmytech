import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetGeocodeCache,
  geocodePostcode,
  haversineMiles,
  isOutwardOnly,
  outwardCode,
} from "./postcodes";

// Real postcodes.io centroids for the districts in Gareth's report.
const NG10 = { latitude: 52.90068, longitude: -1.28417 };
const NG12 = { latitude: 52.90941, longitude: -1.05447 };
const NG10_1AA = { latitude: 52.897228, longitude: -1.272167 };

type Route = Record<string, { latitude: number; longitude: number } | 404>;

function mockApi(routes: Route) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = url.replace("https://api.postcodes.io/", "");
      calls.push(path);
      const hit = routes[path];
      if (!hit || hit === 404) {
        return { ok: false, status: 404, json: async () => ({ status: 404 }) };
      }
      return { ok: true, status: 200, json: async () => ({ status: 200, result: hit }) };
    }),
  );
  return calls;
}

describe("outwardCode / isOutwardOnly", () => {
  it("extracts the district from full and bare postcodes", () => {
    expect(outwardCode("NG10 1AA")).toBe("NG10");
    expect(outwardCode("ng101aa")).toBe("NG10");
    expect(outwardCode("B77")).toBe("B77");
    expect(outwardCode("SW1A 1AA")).toBe("SW1A");
  });

  it("recognises a district on its own", () => {
    expect(isOutwardOnly("NG12")).toBe(true);
    expect(isOutwardOnly("b77")).toBe(true);
    expect(isOutwardOnly("SW1A")).toBe(true);
    expect(isOutwardOnly("NG12 5AA")).toBe(false);
    expect(isOutwardOnly("NG125AA")).toBe(false);
  });
});

describe("geocodePostcode", () => {
  beforeEach(() => _resetGeocodeCache());
  afterEach(() => vi.unstubAllGlobals());

  it("geocodes a full postcode via /postcodes/", async () => {
    const calls = mockApi({ "postcodes/NG101AA": NG10_1AA });
    await expect(geocodePostcode("NG10 1AA")).resolves.toEqual({
      lat: NG10_1AA.latitude,
      lng: NG10_1AA.longitude,
    });
    expect(calls).toEqual(["postcodes/NG101AA"]);
  });

  it("geocodes a bare district via /outcodes/ — the NG10 vs NG12 fault", async () => {
    // /postcodes/NG12 is a 404 on postcodes.io; only /outcodes/NG12 resolves.
    const calls = mockApi({ "postcodes/NG12": 404, "outcodes/NG12": NG12 });
    await expect(geocodePostcode("NG12")).resolves.toEqual({
      lat: NG12.latitude,
      lng: NG12.longitude,
    });
    expect(calls).toEqual(["outcodes/NG12"]);
  });

  it("falls back to the district centre for an unknown full postcode", async () => {
    const calls = mockApi({ "postcodes/NG109ZZ": 404, "outcodes/NG10": NG10 });
    await expect(geocodePostcode("NG10 9ZZ")).resolves.toEqual({
      lat: NG10.latitude,
      lng: NG10.longitude,
    });
    expect(calls).toEqual(["postcodes/NG109ZZ", "outcodes/NG10"]);
  });

  it("returns null and caches it when neither lookup resolves", async () => {
    const calls = mockApi({});
    await expect(geocodePostcode("ZZ99 9ZZ")).resolves.toBeNull();
    await expect(geocodePostcode("ZZ99 9ZZ")).resolves.toBeNull();
    expect(calls).toEqual(["postcodes/ZZ999ZZ", "outcodes/ZZ99"]);
  });

  it("does not cache a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    await expect(geocodePostcode("NG12")).resolves.toBeNull();
    const calls = mockApi({ "outcodes/NG12": NG12 });
    await expect(geocodePostcode("NG12")).resolves.toEqual({
      lat: NG12.latitude,
      lng: NG12.longitude,
    });
    expect(calls).toEqual(["outcodes/NG12"]);
  });

  it("returns null for empty input without calling the API", async () => {
    const calls = mockApi({});
    await expect(geocodePostcode(null)).resolves.toBeNull();
    await expect(geocodePostcode("   ")).resolves.toBeNull();
    expect(calls).toEqual([]);
  });
});

describe("haversineMiles", () => {
  it("puts NG10 inside a 10-mile radius of NG12", () => {
    const d = haversineMiles(
      { lat: NG10.latitude, lng: NG10.longitude },
      { lat: NG12.latitude, lng: NG12.longitude },
    );
    expect(d).toBeGreaterThan(9);
    expect(d).toBeLessThan(10);
  });
});
