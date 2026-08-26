import "server-only";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { REVIEW_TAGS } from "@/lib/reviews/tags";
import { ownsBooking, type BookingCaller } from "@/lib/bookings/ownership";
import { recomputeMechanicAggregates } from "@/lib/mechanics/aggregates";

// The one implementation of "review this job".
//
// Two callers, two different ways of knowing who is reviewing:
//
//   • the website — app/actions/reviews.ts, reached from the PUBLIC review page
//     (/review/[bookingId]) which a customer opens from an email link and may
//     have no account for at all. It passes a null caller: trust there is
//     possession of the booking's full UUID, as it has always been.
//   • the mobile app — app/api/mobile/v1/bookings/[id]/review, which always has
//     a verified Bearer token. It passes that caller, and ownership is enforced:
//     knowing a booking id must not be enough to review someone else's job under
//     their name.
//
// The caller is a PARAMETER, never derived here, for the same reason it is in
// lib/bookings/create-booking.ts: a mobile request carries no cookies, and a
// `customerId` argument on a "use server" export is a public parameter anyone
// can set.
//
// `reviews` has no INSERT policy — every write goes through the service-role
// client, because submitting also recomputes `mechanics.rating`, which no
// customer may write. The checks below are therefore the whole of the
// protection; there is no RLS backstop underneath them.

export type ReviewResult = { ok: true } | { ok: false; error: string };

/** Who is reviewing. Null on the public web page — see the note above. */
export type ReviewCaller = BookingCaller;

export interface SubmitReviewInput {
  rating: number;
  tags: string[];
  comment: string;
}

/**
 * A public comment is shown on the mechanic's profile, so it needs a ceiling.
 * Generous enough that no genuine review hits it — the point is to stop an
 * endpoint that takes free text from writing unbounded rows.
 */
export const MAX_REVIEW_COMMENT_CHARS = 2000;

/**
 * Submit a review for a completed booking.
 *
 * ONE REVIEW PER BOOKING, and a second attempt is REFUSED rather than treated as
 * an edit. That is the existing website behaviour and the `unique (booking_id)`
 * constraint behind it, and it's the right way round for a rating that has
 * already been folded into a mechanic's public average: letting someone revise a
 * 5 to a 1 a month later, silently, moves a number other customers are choosing
 * on. So there is no "edit review" path, on either client.
 */
export async function submitReviewFor(
  bookingId: string,
  input: SubmitReviewInput,
  caller: ReviewCaller | null,
): Promise<ReviewResult> {
  const rating = Math.round(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    return { ok: false, error: "Please pick a rating from 1 to 5 stars." };

  // Only keep tags we actually offer. Anything else is dropped rather than
  // refused — an older app build offering a tag we've since retired should still
  // be able to leave a review.
  const tags = (Array.isArray(input.tags) ? input.tags : []).filter((t) =>
    (REVIEW_TAGS as readonly string[]).includes(t),
  );

  const comment = input.comment.trim() || null;
  if (comment && comment.length > MAX_REVIEW_COMMENT_CHARS)
    return { ok: false, error: `Please keep your review under ${MAX_REVIEW_COMMENT_CHARS} characters.` };

  const admin = createAdminClient();

  const { data: booking } = await admin
    .from("bookings")
    .select("id, status, mechanic_id, customer_id, customer_email")
    .eq("id", bookingId)
    .single();

  if (!booking) return { ok: false, error: "That booking no longer exists." };

  // Same predicate the cancel/reschedule path uses — see lib/bookings/ownership.ts.
  if (caller && !ownsBooking(booking, caller))
    return { ok: false, error: "This isn't your booking." };

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
  if (insErr) {
    // The unique(booking_id) constraint is the backstop for two submissions
    // racing past the check above. Report it as what it is, not as a failure.
    if ((insErr as { code?: string }).code === "23505")
      return { ok: false, error: "You've already reviewed this job." };
    return { ok: false, error: insErr.message };
  }

  await recomputeMechanicAggregates(admin, booking.mechanic_id);

  revalidatePath("/mechanic/reviews");
  revalidatePath(`/review/${bookingId}`);
  return { ok: true };
}
