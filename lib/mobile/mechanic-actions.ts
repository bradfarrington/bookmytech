import "server-only";

// The shared preamble and refusal mapping for the mechanic app's "do something
// to a thing I hold" routes — the mechanic counterpart of
// lib/mobile/customer-actions.ts.

import { enforceBookingLimits } from "@/lib/mobile/booking-guards";
import { requireMobileMechanic, type MobileMechanicRow } from "@/lib/mobile/mechanic-guards";
import { apiError } from "@/lib/mobile/respond";
import type { MobileCaller } from "@/lib/supabase/mobile";

export type MobileMechanicCaller =
  | { ok: true; caller: MobileCaller; mechanic: MobileMechanicRow }
  | { ok: false; response: Response };

/** The rate-limit families a mechanic route may count against. */
export type MechanicLimitFamily =
  | "mechanic"
  | "mechanicfeed"
  | "mechanicchecklist"
  | "mechanicupload"
  /** Shared with the customer app's thread: a conversation has two ends. */
  | "message";

/**
 * `requireMobileMechanic`, then a rate-limit family: `mechanic` for anything
 * that does something, `mechanicfeed` for the reads the app polls, and the
 * three above for the things a mechanic does in bulk.
 */
export async function mobileMechanicCaller(
  request: Request,
  family: MechanicLimitFamily = "mechanic",
): Promise<MobileMechanicCaller> {
  const auth = await requireMobileMechanic(request);
  if (!auth.ok) return auth;
  const limited = await enforceBookingLimits(request, auth.caller, family);
  if (limited) return { ok: false, response: limited };
  return auth;
}

const STATUS = { invalid: 400, forbidden: 403, not_found: 404, conflict: 409 } as const;

/**
 * A shared core's refusal as a response. The cores' refusal sentences are
 * already written for the mechanic, so they go through verbatim — the app
 * shows them, and reads the 409 to tell "someone else got it" from the rest.
 * `failed` is the exception: that text is a database error, so it is logged
 * and replaced.
 */
export function refusalResponse(
  tag: string,
  refusal: { code: keyof typeof STATUS | "failed"; error: string },
): Response {
  if (refusal.code === "failed") {
    console.error(`[${tag}] failed`, refusal.error);
    return apiError("Something went wrong on our side. Please try again in a moment.", 500);
  }
  return apiError(refusal.error, STATUS[refusal.code]);
}
