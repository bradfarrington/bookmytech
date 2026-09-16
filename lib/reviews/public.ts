import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// Reviews for the PUBLIC website (Task 59). Brad's note on Task 55: the admin
// switch should show or hide a review on the website.
//
// ONE SWITCH governs both surfaces. `reviews.is_public` (0074) already drove the
// mechanic profile inside the dashboard; the same column drives this. Turning a
// review off on /admin/reviews takes it off the homepage and off the profile.
//
// WHY NOT mechanic_public_reviews
//
// The 0074 view cannot be reused here, for two independent reasons:
//   • `revoke all … from anon` — the anonymous web role cannot read it at all;
//   • it is gated on `has_booking_with_mechanic(r.mechanic_id)`, so it only ever
//     shows a signed-in customer the reviews of a mechanic they have already
//     booked. On a marketing page that is always nobody.
// Both are right for what that view is for. So this is the service-role read of
// allow-listed columns that Task 46 parked, with the view's own filters mirrored
// so the two surfaces agree on what "public" means.
//
// The filters, matching the view line for line:
//   • is_public
//   • a comment that isn't blank — a bare star rating says nothing on a page
//   • the reviewer's account isn't deleted
//   • first name only, never a surname or an email
//
// The one filter deliberately NOT carried over is `has_booking_with_mechanic`,
// which is the whole point of reading it here instead.
//
// `reviews.is_public` does NOT affect a mechanic's average: lib/mechanics/
// aggregates.ts recomputes `mechanics.rating` from every review. That is
// intentional and documented on the column — hiding a comment from the website
// is an editorial act, not a correction to the mechanic's score.

export interface PublicReview {
  id: string;
  rating: number;
  comment: string;
  createdAt: string;
  /** First name only. Null for a guest-era review with no account behind it. */
  reviewerFirstName: string | null;
}

interface ReviewRow {
  id: string;
  rating: number | null;
  comment: string | null;
  created_at: string;
  customer: { full_name: string | null; deleted_at: string | null } | null;
}

/**
 * The newest public reviews with something to read, for the homepage.
 *
 * Returns [] on any failure, including before 0074 has been applied: the
 * homepage must never fail to render because a review query did. The section
 * renders nothing when this is empty, rather than an empty shell.
 */
export async function loadPublicReviews(limit = 6): Promise<PublicReview[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("reviews")
      // Only what is going to be shown. Never `select("*")` on a table holding
      // `mechanic_response` and a customer_id, on a page served to anyone.
      //
      // `!customer_id` disambiguates the embed: 0074 added
      // `visibility_changed_by`, a SECOND foreign key from reviews to profiles,
      // so a bare `profiles(...)` is rejected with PGRST201. Without the hint
      // this fails at runtime, not at build.
      .select(
        "id, rating, comment, created_at, customer:profiles!customer_id(full_name, deleted_at)",
      )
      .eq("is_public", true)
      .not("comment", "is", null)
      .order("created_at", { ascending: false })
      // Over-fetch a little: blank-but-not-null comments and deleted accounts
      // are filtered below, and one page of rows is cheap.
      .limit(limit * 4);

    if (error) {
      // `is_public` arrives with 0074. Before that this is an unknown column,
      // which is a missing migration and not a bug worth shouting about.
      console.error("[homepage] public reviews load failed:", error.message);
      return [];
    }

    return (data ?? [])
      .map((row) => toPublicReview(row as unknown as ReviewRow))
      .filter((r): r is PublicReview => r !== null)
      .slice(0, limit);
  } catch (err) {
    console.error("[homepage] public reviews load threw:", err);
    return [];
  }
}

function toPublicReview(row: ReviewRow): PublicReview | null {
  const comment = row.comment?.trim();
  if (!comment) return null;
  if (typeof row.rating !== "number") return null;
  // A deleted account's words come down with it.
  if (row.customer?.deleted_at) return null;

  return {
    id: row.id,
    rating: row.rating,
    comment,
    createdAt: row.created_at,
    reviewerFirstName: firstName(row.customer?.full_name),
  };
}

/** First name only, the same derivation as the 0074 view. */
function firstName(fullName: string | null | undefined): string | null {
  const first = fullName?.trim().split(/\s+/)[0];
  return first ? first : null;
}
