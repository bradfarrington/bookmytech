// ADS vehicle attributes (Task 42).
//
// THE ATTRIBUTE LIST IS A MULTIMAP, NOT A DICTIONARY. Names repeat with
// differently-cased or differently-worded values — NV57XGP comes back with
// Fuel = "PETROL" *and* "Petrol", BodyStyle = "4 DOOR SALOON" *and* "Saloon",
// VehicleYear twice. Building an object keyed by Name silently drops half of
// each pair, and which half survives depends on iteration order.
//
// So: the raw list is passed to the parts search VERBATIM, and anything that
// needs one value asks for it explicitly through attributeValue().

import type { AdsAttribute } from "./types";

/**
 * Uppercase, no punctuation — the shape ADS wants as a VRM and the shape we use
 * as a cache key.
 *
 * NB this is NOT lib/utils.ts normaliseReg, which INSERTS A SPACE ("NV57 XGP")
 * for display. Using that here would produce a different cache key per call site
 * and send a VRM ADS may not match.
 */
export function adsRegKey(reg: string): string {
  return String(reg ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Every value recorded under a name, in reply order. */
export function attributeValues(
  attrs: readonly AdsAttribute[],
  name: string,
): string[] {
  const wanted = name.toLowerCase();
  return attrs
    .filter((a) => String(a?.Name ?? "").toLowerCase() === wanted)
    .map((a) => String(a?.Value ?? "").trim())
    .filter(Boolean);
}

/**
 * One value for a name. Prefers the longest when several exist, because the
 * fuller wording is the more useful one to show ("4 DOOR SALOON" over "Saloon").
 */
export function attributeValue(
  attrs: readonly AdsAttribute[],
  name: string,
): string | null {
  const values = attributeValues(attrs, name);
  if (values.length === 0) return null;
  return values.reduce((best, v) => (v.length > best.length ? v : best), values[0]);
}

export interface LkqVehicleSummary {
  make: string | null;
  model: string | null;
  derivative: string | null;
  year: string | null;
  fuel: string | null;
  engineCc: string | null;
  engineCode: string | null;
  bodyStyle: string | null;
  transmission: string | null;
  vin: string | null;
  imageUrl: string | null;
}

/** A human-readable summary for the results header. */
export function vehicleSummary(attrs: readonly AdsAttribute[]): LkqVehicleSummary {
  const image = attributeValue(attrs, "Image Name");
  return {
    make: attributeValue(attrs, "Make") ?? attributeValue(attrs, "DvlaMake"),
    model: attributeValue(attrs, "Model") ?? attributeValue(attrs, "DvlaModel"),
    derivative: attributeValue(attrs, "Derivative"),
    year: attributeValue(attrs, "VehicleYear"),
    fuel: attributeValue(attrs, "Fuel"),
    engineCc: attributeValue(attrs, "ExactCC") ?? attributeValue(attrs, "CC"),
    engineCode: attributeValue(attrs, "EngineCode") ?? attributeValue(attrs, "DVLA_ENGINE_CODE"),
    bodyStyle: attributeValue(attrs, "BodyStyle"),
    transmission: attributeValue(attrs, "TransmissionType"),
    vin: attributeValue(attrs, "VIN"),
    imageUrl: image && /^https?:\/\//i.test(image) ? image : null,
  };
}

/** "Volvo S40 1.6 PETROL (2008)" — one line for a results header. */
export function describeVehicle(summary: LkqVehicleSummary): string {
  const cc = summary.engineCc ? `${(Number(summary.engineCc) / 1000).toFixed(1)}` : null;
  return [
    summary.make,
    summary.model,
    cc && Number.isFinite(Number(summary.engineCc)) ? cc : null,
    summary.fuel,
    summary.year ? `(${summary.year})` : null,
  ]
    .filter(Boolean)
    .join(" ");
}
