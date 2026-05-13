// Subset of the DVLA Vehicle Enquiry Service response that's useful for
// our customer-facing flows. The API returns more fields than this — extend
// as we need them. `model` is intentionally optional: DVLA itself doesn't
// return it, but we keep the field so we can backfill from another source
// (MOT history, customer confirmation) later without a type churn.
export interface VehicleDetails {
  registrationNumber: string;
  make: string;
  model?: string;
  colour?: string;
  fuelType?: string;
  yearOfManufacture?: number;
  engineCapacity?: number;
  motStatus?: string;
  motExpiryDate?: string;
  taxStatus?: string;
  taxDueDate?: string;
  co2Emissions?: number;
}

export type LookupResult =
  | { ok: true; details: VehicleDetails }
  | { ok: false; code: "not_found" | "invalid_reg" | "rate_limited" | "unknown"; message: string };
