"use server";

import { lookupVehicle } from "@/lib/dvla/client";
import { lookupMotVehicle } from "@/lib/dvla/mot-client";
import type { LookupResult } from "@/lib/dvla/types";
import { normaliseReg } from "@/lib/utils";

// Loose shape check before hitting DVLA, tested against the space-stripped
// reg. Covers current (AB12 CDE), prefix (A123 BCD), suffix (ABC 123D) and
// dateless/NI (digits+letters either way round) formats — DVLA is the
// authority on whether the reg actually exists.
const UK_REG_REGEX =
  /^(?:[A-Z]{2}\d{2}[A-Z]{3}|[A-Z]\d{1,3}[A-Z]{3}|[A-Z]{3}\d{1,3}[A-Z]|[A-Z]{1,3}\d{1,4}|\d{1,4}[A-Z]{1,3})$/i;

// In-memory cache keyed by reg. Booking flow refreshes the vehicle page on
// back-navigation and form submits — without this, each refresh hits both
// DVLA VES and DVSA MOT again. Successful lookups only; errors are not cached
// so a transient API blip doesn't poison the cache.
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { result: LookupResult; expiresAt: number }>();

export async function lookupVehicleAction(reg: string): Promise<LookupResult> {
  const normalised = normaliseReg(reg);
  if (!normalised || !UK_REG_REGEX.test(normalised.replace(/ /g, ""))) {
    return {
      ok: false,
      code: "invalid_reg",
      message: "That doesn't look like a valid UK registration.",
    };
  }

  const cached = cache.get(normalised);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  // DVLA VES is authoritative for tax/MOT status; MOT History supplies model.
  // Run in parallel — MOT is a best-effort enrichment, so we never let a MOT
  // failure block the primary lookup.
  const [vesResult, motResult] = await Promise.all([
    lookupVehicle(normalised),
    lookupMotVehicle(normalised),
  ]);

  const result: LookupResult =
    vesResult.ok && motResult.ok && motResult.model
      ? {
          ok: true,
          details: { ...vesResult.details, model: motResult.model },
        }
      : vesResult;

  if (result.ok) {
    cache.set(normalised, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  }
  return result;
}
