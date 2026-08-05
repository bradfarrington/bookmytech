"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
 * Mechanic leaves (or edits) their single reply to a review. Mechanics have no
 * write rights on `reviews` under RLS, so we verify ownership in the RLS-aware
 * client, then write the response via service-role.
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

  const text = response.trim();
  if (!text) return { ok: false, error: "Write a reply first." };
  if (text.length > 1000)
    return { ok: false, error: "Keep your reply under 1000 characters." };

  const admin = createAdminClient();
  const { data: review } = await admin
    .from("reviews")
    .select("id, mechanic_id")
    .eq("id", reviewId)
    .single();

  if (!review) return { ok: false, error: "That review no longer exists." };
  if (review.mechanic_id !== user.id)
    return { ok: false, error: "This isn't your review." };

  const { error } = await admin
    .from("reviews")
    .update({ mechanic_response: text })
    .eq("id", reviewId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/mechanic/reviews");
  return { ok: true };
}
