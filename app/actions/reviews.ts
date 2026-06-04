"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { REVIEW_TAGS } from "@/lib/reviews/tags";

export type ReviewResult = { ok: true } | { ok: false; error: string };

/**
 * Customer submits a review for a completed booking. Called from the public
 * (guest) review page, so there's no auth session — we verify everything via
 * the service-role client: the booking exists, it's completed, and it hasn't
 * been reviewed yet. On success we recompute the mechanic's average rating.
 */
export async function submitReview(
  bookingId: string,
  input: { rating: number; tags: string[]; comment: string },
): Promise<ReviewResult> {
  const rating = Math.round(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    return { ok: false, error: "Please pick a rating from 1 to 5 stars." };

  // Only keep tags we actually offer.
  const tags = input.tags.filter((t) =>
    (REVIEW_TAGS as readonly string[]).includes(t),
  );
  const comment = input.comment.trim() || null;

  const admin = createAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select("id, status, mechanic_id, customer_id")
    .eq("id", bookingId)
    .single();

  if (!booking) return { ok: false, error: "That booking no longer exists." };
  if (booking.status !== "completed")
    return { ok: false, error: "You can only review a completed job." };
  if (!booking.mechanic_id)
    return { ok: false, error: "This booking has no mechanic to review." };

  const { data: existing } = await admin
    .from("reviews")
    .select("id")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (existing) return { ok: false, error: "You've already reviewed this job." };

  const { error: insErr } = await admin.from("reviews").insert({
    booking_id: bookingId,
    customer_id: booking.customer_id,
    mechanic_id: booking.mechanic_id,
    rating,
    tags,
    comment,
  });
  if (insErr) return { ok: false, error: insErr.message };

  // Recompute the mechanic's headline rating from all their reviews.
  const { data: all } = await admin
    .from("reviews")
    .select("rating")
    .eq("mechanic_id", booking.mechanic_id);
  if (all && all.length > 0) {
    const avg = all.reduce((sum, r) => sum + r.rating, 0) / all.length;
    await admin
      .from("mechanics")
      .update({ rating: Math.round(avg * 100) / 100 })
      .eq("id", booking.mechanic_id);
  }

  revalidatePath("/mechanic/reviews");
  revalidatePath(`/review/${bookingId}`);
  return { ok: true };
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
