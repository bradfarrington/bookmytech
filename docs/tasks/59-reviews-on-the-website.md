# Task 59: The review switch controls the public website

**Status:** ✅ Built (2026-09-16): `lib/reviews/public.ts`, a "What customers say" section on the homepage, the admin switch relabelled "Shown publicly" and now revalidating `/`, and the consent line on both review forms. Item 1 of Task 55. **No migration** — it reuses `reviews.is_public` from `0074`.

## Why

Brad's note on Task 55: the admin switch should show or hide a review **on the website**. Today `reviews.is_public` (`0074`) only feeds the mechanic profile inside the dashboard and the app, which just the customers who booked that mechanic ever see. The public website showed no reviews at all — Task 46 replaced the placeholder testimonials with the mechanic-recruitment panel, on the rule that the homepage carries no invented numbers.

**Brad's decisions (2026-09-16):** homepage only, and **one switch** covering both surfaces.

## `mechanic_public_reviews` could not be reused

Two independent reasons, both correct for what that view is for:

- `revoke all … from anon` — the anonymous web role cannot read it at all.
- It is gated on `has_booking_with_mechanic(r.mechanic_id)`, so it only ever shows a signed-in customer the reviews of a mechanic they have already booked. On a marketing page that is always nobody.

So this is the service-role read of allow-listed columns that Task 46 parked, in `lib/reviews/public.ts`, with the view's filters mirrored line for line so both surfaces agree on what "public" means: `is_public`, a non-blank comment, no deleted account, first name only. The one filter deliberately not carried over is `has_booking_with_mechanic`.

**A real trap found while building it:** a bare `profiles(...)` embed is rejected with `PGRST201`, because `0074` added `visibility_changed_by` as a **second** foreign key from `reviews` to `profiles`. The select needs the `!customer_id` hint. This fails at runtime, not at build, so it would have shipped as a homepage that silently showed nothing.

## Design

- **`lib/reviews/public.ts`** — `loadPublicReviews(limit)`. Returns `[]` on any failure, including before `0074`: the homepage must never fail to render because a review query did.
- **`app/(customer)/_components/reviews.tsx`** — "What customers say", between the dark repairs band and the mechanic panel. `bg-white` so the bands alternate dark → white → surface; `bg-surface` would have merged into the panel below it.
  - **Renders nothing when there are no reviews.** No empty shell, no filler card. That also means it stays absent until the first public review exists, which is right for a new site rather than a state worth designing for.
  - **No aggregate rating is claimed.** A site-wide "4.9 from 300 reviews" is a number we would have to stand behind. Individual reviews speak without it, and it keeps Task 46's no-invented-numbers rule.
  - The byline is a first name, or "A Book My Tech customer" for a guest-era review with no account. Never a surname, never an email, never a made-up name.
- **`revalidatePath("/")`** added to `setReviewVisibility`. The homepage sets `revalidate = 3600`, so without it a review switched off could stay up for an hour. That is the one delay this switch must not have.
- **Relabelled** to "Shown publicly", with the caption naming both surfaces.
- **Consent copy** on both review forms now says the review may appear on the website, and that we never show a surname or email. The signed-in form is under `dashboard/(shell)/bookings/[id]/review/`; the guest form is `app/(customer)/review/[bookingId]/`.

**The hardcoded `Stars value={5}` and `"4.9"` in `live-dispatch-card.tsx` were left alone.** That card is an illustrative dispatch animation for a fictional mechanic, not a claim about real ratings. Flagging rather than wiring it to live data.

**`is_public` still does not affect a mechanic's average.** `lib/mechanics/aggregates.ts` recomputes `mechanics.rating` from every review. Intentional and documented on the column: hiding a comment is editorial, not a correction to the mechanic's score.

## Acceptance criteria

- [x] The homepage shows real reviews, driven by the same `reviews.is_public` as the mechanic profile
- [x] One switch, not two
- [x] Only reviews with a comment, and none from a deleted account
- [x] First name only; "A Book My Tech customer" when there is no account behind it
- [x] The section renders nothing rather than an empty shell when there is nothing to show
- [x] Hiding a review revalidates `/` instead of waiting out the hour
- [x] Admin switch and caption relabelled; both consent lines updated
- [x] Verified against the live database: the query returns the 3 real public reviews, and the `PGRST201` embed ambiguity is fixed
- [x] `tsc` clean, `next build` passes, 570 tests pass, no new lint problems
- [ ] Seen in a browser, at 375px and desktop, and a review switched off on `/admin/reviews` confirmed to leave the homepage at once. **Needs the dev server and an admin session.**

## Mobile app — tell Brad

**Copy only, no API change.** The app's review form has the same consent line and should match: the review may appear on the mechanic's profile *and on the Book My Tech website*, and we never show a surname or email. The app reads `mechanic_public_reviews`, which is untouched.

## When complete

Tick the boxes above, set the Status line, update `docs/HANDOFF.md`, commit.
