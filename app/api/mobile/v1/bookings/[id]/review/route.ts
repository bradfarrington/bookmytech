import { isUuid, mobileActionCaller } from "@/lib/mobile/customer-actions";
import { apiError, apiOk, readJsonBody } from "@/lib/mobile/respond";
import { submitReviewFor } from "@/lib/reviews/submit-review";

// POST /api/mobile/v1/bookings/:id/review — rate a completed job.
// AUTHENTICATED.
//
// Body: { rating, tags?, comment? }
//       `rating` 1–5. `tags` are matched against REVIEW_TAGS (lib/reviews/tags.ts)
//       and anything unrecognised is DROPPED, not refused — an old build offering
//       a tag we've since retired should still be able to leave a review.
// 200:  { ok: true } | { ok: false, error }. "You've already reviewed this job"
//       and "You can only review a completed job" are requests that RAN with a
//       negative answer. Only transport-level problems return `{ error }` with a
//       non-2xx: 401, 400/415 (bad body or id), 429.
//
// ONE REVIEW PER BOOKING, and a second submission is REFUSED — there is no edit
// path, so the app should not offer "Edit review". See the note on
// `submitReviewFor` for why a rating already folded into a public average isn't
// revisable.
//
// Thin wrapper over `submitReviewFor` — the SAME function the website's public
// review page calls through app/actions/reviews.ts. Submitting recomputes the
// mechanic's `rating` and `job_count`, which is why this can't be an RLS INSERT
// policy: no customer may write those.
//
// OWNERSHIP comes from the verified caller. The website's path is
// possession-based (an email link, opened by someone who may have no account),
// but the app always knows who is calling, and a bare booking id must not be
// enough to post a review under someone else's name.

interface ReviewBody {
  rating?: unknown;
  tags?: unknown;
  comment?: unknown;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isUuid(id)) return apiError("We couldn't find that booking.", 400);

  const parsed = await readJsonBody<ReviewBody>(request);
  if (!parsed.ok) return parsed.response;

  const auth = await mobileActionCaller(request, "action");
  if (!auth.ok) return auth.response;

  const { rating, tags, comment } = parsed.body;
  if (typeof rating !== "number" || !Number.isFinite(rating)) {
    return apiError("Please pick a rating from 1 to 5 stars.", 400);
  }

  return apiOk(
    await submitReviewFor(
      id,
      {
        rating,
        tags: Array.isArray(tags) ? tags.filter((t): t is string => typeof t === "string") : [],
        comment: typeof comment === "string" ? comment : "",
      },
      auth.bookingCaller,
    ),
  );
}
