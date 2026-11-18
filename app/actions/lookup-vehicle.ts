"use server";

import { after } from "next/server";
import { lookupVehicle } from "@/lib/dvla/client";
import { lookupMotVehicle } from "@/lib/dvla/mot-client";
import type { LookupResult } from "@/lib/dvla/types";
import { warmVehicleParts } from "@/lib/parts/warm-parts";
import { createAdminClient } from "@/lib/supabase/admin";
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

/**
 * `warmParts`: also start pricing the car's parts with NAPA (2026-11-18). Only
 * the booking's own entry points pass it (the reg box, the vehicle step, the
 * app's lookup): the garage list, reminders and the HaynesPro resolver look
 * regs up too, and nobody is about to browse repairs for those.
 */
export async function lookupVehicleAction(reg: string, options: { warmParts?: boolean } = {}): Promise<LookupResult> {
  const normalised = normaliseReg(reg);
  if (!normalised || !UK_REG_REGEX.test(normalised.replace(/ /g, ""))) {
    return {
      ok: false,
      code: "invalid_reg",
      message: "That doesn't look like a valid UK registration.",
    };
  }

  // Start pricing the car's parts with NAPA now, so the repair list has its
  // prices by the time the customer gets there (2026-11-18). After the
  // response: DVLA's answer is never held up. Website and app both look up
  // here, with `warmParts`. warmVehicleParts skips a car it warmed in the
  // last 10 minutes.
  const warm = () => {
    if (options.warmParts) after(() => warmVehicleParts(createAdminClient(), normalised).then(() => undefined));
  };

  const cached = cache.get(normalised);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.result.ok) warm();
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
    warm();
  }
  return result;
}
