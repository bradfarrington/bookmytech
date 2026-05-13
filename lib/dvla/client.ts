import "server-only";
import type { LookupResult, VehicleDetails } from "./types";

const DVLA_ENDPOINT =
  "https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles";

// Canned responses for development / API-key-less environments. The reg keys
// here are normalised (single space, upper-case) — match the output of
// `normaliseReg()`.
const STUB_VEHICLES: Record<string, VehicleDetails> = {
  "LB21 XYZ": {
    registrationNumber: "LB21 XYZ",
    make: "VOLKSWAGEN",
    model: "Golf",
    colour: "GREY",
    fuelType: "PETROL",
    yearOfManufacture: 2021,
    engineCapacity: 1498,
    motStatus: "Valid",
    motExpiryDate: "2026-08-14",
    taxStatus: "Taxed",
    taxDueDate: "2026-09-01",
    co2Emissions: 132,
  },
  "AB12 CDE": {
    registrationNumber: "AB12 CDE",
    make: "FORD",
    model: "Fiesta",
    colour: "BLUE",
    fuelType: "PETROL",
    yearOfManufacture: 2012,
    engineCapacity: 1242,
    motStatus: "Valid",
    motExpiryDate: "2026-03-22",
    taxStatus: "Taxed",
    taxDueDate: "2026-07-01",
    co2Emissions: 120,
  },
  "XY99 ZZZ": {
    registrationNumber: "XY99 ZZZ",
    make: "TESLA",
    model: "Model 3",
    colour: "WHITE",
    fuelType: "ELECTRICITY",
    yearOfManufacture: 2022,
    motStatus: "Valid",
    motExpiryDate: "2026-11-04",
    taxStatus: "Taxed",
    taxDueDate: "2027-01-01",
    co2Emissions: 0,
  },
};

export async function lookupVehicle(reg: string): Promise<LookupResult> {
  const normalised = reg.trim().toUpperCase();
  const apiKey = process.env.DVLA_API_KEY;

  if (!apiKey) {
    const stub = STUB_VEHICLES[normalised];
    if (stub) return { ok: true, details: stub };
    return {
      ok: false,
      code: "not_found",
      message: "No vehicle found for that registration (stub mode).",
    };
  }

  // DVLA expects the reg without spaces.
  const registrationNumber = normalised.replace(/\s+/g, "");

  let response: Response;
  try {
    response = await fetch(DVLA_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ registrationNumber }),
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      code: "unknown",
      message: "Couldn't reach DVLA. Please try again in a moment.",
    };
  }

  if (response.ok) {
    const data = (await response.json()) as VehicleDetails;
    return { ok: true, details: data };
  }

  if (response.status === 404) {
    return {
      ok: false,
      code: "not_found",
      message: "We couldn't find that registration on DVLA.",
    };
  }
  if (response.status === 400) {
    return {
      ok: false,
      code: "invalid_reg",
      message: "That doesn't look like a valid UK registration.",
    };
  }
  if (response.status === 429) {
    return {
      ok: false,
      code: "rate_limited",
      message: "We're being rate-limited by DVLA. Try again shortly.",
    };
  }

  return {
    ok: false,
    code: "unknown",
    message: "Something went wrong looking up your vehicle.",
  };
}
