import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { refuse, type MechanicRefusal } from "@/lib/mechanics/refusal";

// A mechanic's single public reply to one of their reviews, shared by the
// website's server action (app/actions/reviews.ts) and the mechanic app's route
// handler (POST /api/mobile/v1/mechanic/reviews/[id]/response) — Task 70.
//
// Mechanics have no UPDATE rights on `reviews` under RLS (0012), so ownership is
// verified here against the service-role client and the write goes through the
// same one. Editing an existing reply is this same call: one reply per review,
// overwritten in place, which is how the website's editor has always behaved.
//
// Who the mechanic is is a PARAMETER. Nothing in a request body names them.

export const MAX_RESPONSE_LENGTH = 1000;

export type ReviewResponseResult = { ok: true } | MechanicRefusal;

export async function respondToReviewFor(
  mechanicId: string,
  reviewId: string,
  response: string,
): Promise<ReviewResponseResult> {
  const text = typeof response === "string" ? response.trim() : "";
  if (!text) return refuse("invalid", "Write a reply first.");
  if (text.length > MAX_RESPONSE_LENGTH) {
    return refuse("invalid", "Keep your reply under 1000 characters.");
  }

  const admin = createAdminClient();
  const { data: review } = await admin
    .from("reviews")
    .select("id, mechanic_id")
    .eq("id", reviewId)
    .maybeSingle();

  if (!review) return refuse("not_found", "That review no longer exists.");
  if (review.mechanic_id !== mechanicId) return refuse("forbidden", "This isn't your review.");

  const { error } = await admin
    .from("reviews")
    .update({ mechanic_response: text })
    .eq("id", reviewId);
  if (error) return refuse("failed", error.message);

  return { ok: true };
}
