"use server";

import { lookupVehicle } from "@/lib/dvla/client";
import { lookupMotVehicle } from "@/lib/dvla/mot-client";
import type { LookupResult } from "@/lib/dvla/types";
import { normaliseReg } from "@/lib/utils";

const UK_REG_REGEX = /^[A-Z0-9]{2,3} ?[A-Z0-9]{3,4}$/i;

export async function lookupVehicleAction(reg: string): Promise<LookupResult> {
  const normalised = normaliseReg(reg);
  if (!normalised || !UK_REG_REGEX.test(normalised)) {
    return {
      ok: false,
      code: "invalid_reg",
      message: "That doesn't look like a valid UK registration.",
    };
  }

  // DVLA VES is authoritative for tax/MOT status; MOT History supplies model.
  // Run in parallel — MOT is a best-effort enrichment, so we never let a MOT
  // failure block the primary lookup.
  const [vesResult, motResult] = await Promise.all([
    lookupVehicle(normalised),
    lookupMotVehicle(normalised),
  ]);

  if (vesResult.ok && motResult.ok && motResult.model) {
    return {
      ok: true,
      details: { ...vesResult.details, model: motResult.model },
    };
  }
  return vesResult;
}
