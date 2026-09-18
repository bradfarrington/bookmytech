"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { respondToReviewFor } from "@/lib/reviews/respond";
import { submitReviewFor } from "@/lib/reviews/submit-review";

export type ReviewResult = { ok: true } | { ok: false; error: string };

/**
 * Customer submits a review for a completed booking. The WEBSITE's entry point
 * into the review core — a thin wrapper over `submitReviewFor`, which the mobile
 * route (app/api/mobile/v1/bookings/[id]/review) also calls.
 *
 * Passes a NULL caller. This is reached from the PUBLIC review page
 * (/review/[bookingId]), opened from an email link by someone who may have no
 * account at all, so there is no session to resolve and the trust model is
 * possession of the booking's full UUID — unchanged. The core still verifies
 * everything else via the service-role client: the booking exists, it's
 * completed, and it hasn't been reviewed yet.
 *
 * The mobile route passes its verified caller instead and gets an ownership
 * check, because it always knows who is asking.
 */
export async function submitReview(
  bookingId: string,
  input: { rating: number; tags: string[]; comment: string },
): Promise<ReviewResult> {
  return submitReviewFor(bookingId, input, null);
}

/**
 * A signed-in customer reviews a completed booking from their dashboard
 * (/dashboard/bookings/[id]/review, Task 48).
 *
 * Unlike `submitReview` above, this resolves the caller from the cookie session
 * and passes it to the core, so ownership is enforced exactly as on the mobile
 * route: knowing a booking id is not enough to review someone else's job. The
 * caller is never a parameter; see app/actions/customer-bookings.ts for why.
 */
export async function submitReviewAsCustomer(
  bookingId: string,
  input: { rating: number; tags: string[]; comment: string },
): Promise<ReviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Please sign in to leave a review." };

  // A server action takes whatever the browser sends, so shape it before the core reads it.
  const result = await submitReviewFor(
    bookingId,
    {
      rating: Number(input?.rating),
      tags: Array.isArray(input?.tags) ? input.tags.filter((t): t is string => typeof t === "string") : [],
      comment: typeof input?.comment === "string" ? input.comment : "",
    },
    { userId: user.id, email: user.email ?? null },
  );
  if (result.ok) {
    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/bookings/${bookingId}`);
  }
  return result;
}

/**
 * Mechanic leaves (or edits) their single reply to a review. The WEBSITE's
 * entry point into `respondToReviewFor` (lib/reviews/respond.ts), which the
 * mechanic app's route (POST /api/mobile/v1/mechanic/reviews/[id]/response)
 * also calls. The caller is resolved from the cookie session here and from a
 * verified Bearer token there; the core never derives it.
 */
export async function respondToReview(
  reviewId: string,
  response: string,
): Promise<ReviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const result = await respondToReviewFor(user.id, reviewId, response);
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/mechanic/reviews");
  return { ok: true };
}
