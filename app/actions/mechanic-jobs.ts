"use server";

import { revalidatePath } from "next/cache";
import { requireMechanic } from "@/lib/mechanics/require-mechanic";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelOwnJobFor } from "@/lib/mechanics/cancel-job";
import { proposeRescheduleFor } from "@/lib/bookings/propose-reschedule";
import { setArrivalWindowFor } from "@/lib/mechanics/set-arrival-window";

export type MechanicJobResult = { ok: true } | { ok: false; error: string };

// Mechanic-side job actions for the desktop detail view (Task 05 Stage 4).
//
// Mechanics have no UPDATE/INSERT rights on bookings or booking_events under
// RLS, so — exactly like accept/decline (job-offers.ts) — we verify the caller
// owns the job in an RLS-aware client, then write via the service-role client.
// Each action re-reads the booking under the admin client and re-checks
// ownership + status before mutating, so a stale page can't drive a bad write.

/**
 * Cancel a job the mechanic has accepted — see lib/mechanics/cancel-job.ts,
 * shared with the mechanic app's route handler.
 */
export async function cancelOwnJob(
  bookingId: string,
  reason: string,
): Promise<MechanicJobResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  const result = await cancelOwnJobFor(guard.mechanicId, bookingId, reason);
  return result.ok ? result : { ok: false, error: result.error };
}

/**
 * Propose a new time slot to the customer. We store the proposal on the booking
 * and notify the customer; the booking keeps its current slot + assignment
 * until the customer responds (respondToRescheduleFor in lib/bookings).
 */
export async function proposeReschedule(
  bookingId: string,
  newIso: string,
  note: string,
): Promise<MechanicJobResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  // The core lives in lib/bookings/propose-reschedule.ts (Task 38), shared
  // with "Running late?" on the day view, which proposes for several jobs.
  const res = await proposeRescheduleFor(guard.mechanicId, bookingId, newIso, note);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/mechanic/jobs");
  revalidatePath(`/mechanic/jobs/${bookingId}`);
  return { ok: true };
}

/**
 * Running late (Task 38): propose a new time for several of today's later
 * jobs in one go — each customer gets the same email/SMS and the same
 * accept/decline banner as a single proposal. One guard, N proposals; a job
 * that can't be moved (already en route, not yours, in the past) is reported
 * by id and the others still go through.
 */
export async function proposeReschedules(
  items: Array<{ bookingId: string; newIso: string }>,
  note: string,
): Promise<{ ok: true; proposed: number; failed: Array<{ bookingId: string; error: string }> } | { ok: false; error: string }> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  const list = Array.isArray(items) ? items.slice(0, 20) : [];
  if (list.length === 0) return { ok: false, error: "Pick at least one job to move." };
  const admin = createAdminClient();
  let proposed = 0;
  const failed: Array<{ bookingId: string; error: string }> = [];
  for (const item of list) {
    if (typeof item?.bookingId !== "string" || typeof item?.newIso !== "string") continue;
    const res = await proposeRescheduleFor(guard.mechanicId, item.bookingId, item.newIso, note ?? "", admin);
    if (res.ok) {
      proposed += 1;
      revalidatePath(`/mechanic/jobs/${item.bookingId}`);
    } else failed.push({ bookingId: item.bookingId, error: res.error });
  }
  revalidatePath("/mechanic/jobs");
  return { ok: true, proposed, failed };
}

/**
 * Narrow an ALL-DAY booking to one of the six 2-hour arrival windows (Task 21).
 *
 * The customer agreed to the whole day, so any window inside it needs no
 * consent from them — unlike `proposeReschedule`, this applies immediately and
 * the customer is simply told. It is ONE SHOT (owner decision 2026-09-03):
 * once a window is set the gate below refuses a second pick, and moving it
 * again means proposing a new time so the customer can agree.
 *
 * Storage is in place: `slot_window` becomes the 2-hour label and
 * `scheduled_at` its start (later on the same UK day, so the cancellation-fee
 * boundary can only move in the customer's favour). Every display path, and
 * the mobile app reading the row directly, shows the narrower window with no
 * further change. The original window is kept in the `arrival_window_set`
 * event (0052).
 *
 * A FLEXIBLE booking (Task 28) — the customer offered several days — takes
 * `dayKey` as well: one of `candidate_days`. The pick lands on that day (which
 * may be later than the earliest day `scheduled_at` was parked on), and
 * `candidate_days` is cleared; the offered set goes into the event payload.
 * Day and window are one move, and the same one shot.
 */
export async function setArrivalWindow(
  bookingId: string,
  window: string,
  dayKey?: string,
): Promise<MechanicJobResult> {
  const guard = await requireMechanic();
  if (!guard.ok) return guard;
  // Shared with the mechanic app's route handler.
  const result = await setArrivalWindowFor(guard.mechanicId, bookingId, window, dayKey);
  return result.ok ? result : { ok: false, error: result.error };
}
