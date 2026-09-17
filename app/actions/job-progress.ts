"use server";

import { requireMechanic } from "@/lib/mechanics/require-mechanic";
import {
  beginWorkFor,
  completeAndChargeFor,
  setJobMileageFor,
  startJourneyFor,
} from "@/lib/mechanics/job-progress";

export type JobProgressResult = { ok: true } | { ok: false; error: string };

// Live job-lifecycle actions for the desktop job-detail view. The work lives in
// lib/mechanics/job-progress.ts, shared with the mechanic app's route handlers
// (Task 67). These actions only resolve the mechanic from the cookie session —
// the mechanic id is deliberately not an argument, because every export of a
// "use server" file is browser-reachable with arguments of the caller's choosing.

function webResult(result: { ok: true } | { ok: false; error: string }): JobProgressResult {
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

/** confirmed → en_route. Stamps en_route_at and tells the customer you're on the way. */
export async function startJourney(bookingId: string): Promise<JobProgressResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  return webResult(await startJourneyFor(guard.mechanicId, bookingId));
}

/** en_route → in_progress. Stamps started_at. */
export async function beginWork(bookingId: string): Promise<JobProgressResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  return webResult(await beginWorkFor(guard.mechanicId, bookingId));
}

/** Record the vehicle's odometer reading on the job (Task 30). */
export async function setJobMileage(bookingId: string, mileage: number): Promise<JobProgressResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  return webResult(await setJobMileageFor(guard.mechanicId, bookingId, mileage));
}

/** in_progress → completed: capture the pre-authorisation, pay the mechanic, send the receipt. */
export async function completeAndCharge(bookingId: string): Promise<JobProgressResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  return webResult(await completeAndChargeFor(guard.mechanicId, bookingId));
}
