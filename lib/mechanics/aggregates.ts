import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Recompute a mechanic's headline `rating` and `job_count` from the rows that
 * define them.
 *
 * Deliberately a recount rather than an increment: it is idempotent, so a retry
 * or a hand-fixed row can't drift the figure, and it repairs whatever the
 * previous value was.
 *
 * `job_count` is counted from COMPLETED bookings, not from reviews — it means
 * "jobs done", and most jobs are never reviewed. A booking sitting in `disputed`
 * is not counted while the dispute is open and comes back when it resolves to
 * `completed`, which is the honest reading of both states.
 *
 * Two callers, and both are needed:
 *
 *   • completeAndCharge (app/actions/job-progress.ts) — the CORRECT trigger for
 *     `job_count`. A completed job is what the number counts, so it has to move
 *     when a job completes, whether or not anyone ever reviews it.
 *   • submitReview (lib/reviews/submit-review.ts) — the correct trigger for
 *     `rating`, which only a new review can change.
 *
 * Both recompute both, because the recount is cheap, idempotent and self-
 * repairing: whichever fires first leaves the pair consistent. Until this was
 * shared, `job_count` was written ONLY by submitReview, so it sat at 0 for every
 * mechanic nobody had reviewed while four admin/mechanic surfaces displayed it
 * as fact.
 *
 * Non-fatal by contract for the completion path: the caller has already taken
 * the customer's money and paid the mechanic, so a failed recount must not undo
 * a finished job. It self-heals on the next completion or review.
 */
export async function recomputeMechanicAggregates(
  admin: SupabaseClient,
  mechanicId: string,
): Promise<void> {
  const { data: all } = await admin
    .from("reviews")
    .select("rating")
    .eq("mechanic_id", mechanicId);

  const { count: jobCount } = await admin
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("mechanic_id", mechanicId)
    .eq("status", "completed");

  const update: { rating?: number; job_count?: number } = {};
  if (all && all.length > 0) {
    const avg = all.reduce((sum, r) => sum + r.rating, 0) / all.length;
    update.rating = Math.round(avg * 100) / 100;
  }
  if (typeof jobCount === "number") update.job_count = jobCount;
  if (Object.keys(update).length === 0) return;

  await admin.from("mechanics").update(update).eq("id", mechanicId);
}
