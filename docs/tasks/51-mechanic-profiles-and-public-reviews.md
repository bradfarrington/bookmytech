# Task 51: Mechanic profiles and public reviews

**Status:** ✅ Built (2026-09-15): migration `0074_mechanic_profiles_and_public_reviews.sql`, `lib/mechanics/profile.ts`, `/dashboard/mechanics/[id]`, the "Shown on profile" switch on `/admin/reviews` (hidden until `0074` is applied) and the consent line on both web review forms. `0074` applied 2026-09-15.

## Why

The redesigned mechanic profile (`mockups/04-booking-detail.html`, "Mechanic profile") shows specialisms, when the mechanic joined, and recent reviews from other customers. A customer could read none of these:
- `mechanics` has no customer policy, and mustn't get one: it holds `base_postcode` and the `stripe_*` columns.
- `reviews` is readable only for the customer's own bookings.

## Design

- **`mechanic_cards` gains `specialisms` and `approved_at`**, appended so existing columns keep their positions. The gate is unchanged: only mechanics on the caller's own bookings.
- **`reviews.is_public`** defaults to true, so reviews publish automatically. An admin can hide one, and `visibility_changed_at` and `visibility_changed_by` record who and when. A hidden review still counts towards the average rating.
- **`mechanic_public_reviews` view**, in the same pattern as `mechanic_cards` (owner privileges, column allow-list, `has_booking_with_mechanic`). It lists a mechanic's public reviews that have a comment, with the reviewer's first name only. It leaves out reviews by customers who deleted their account.
- **Consent line** on both review forms: the customer's first name, rating and comment may be shown on the mechanic's profile.

This follows the parked public-reviews plan in Task 46, with one difference: a review has to be written about a mechanic you've booked before you can read it. Showing reviews on the public website stays parked.

## Acceptance criteria

- [x] `0074` applied (owner, confirmed 2026-09-15)
- [x] A customer can read specialisms and the approval date for mechanics they've booked, and nothing new about anyone else
- [x] A customer can read other customers' public reviews (with a comment, first name only) for mechanics they've booked
- [x] Admin can hide or show a review on `/admin/reviews` (Task 48)
- [x] Website mechanic profile page (Task 48)
- [x] Review forms carry the consent line (Task 48). App side is in the handover brief

## Mobile app

- Run `npm run db:types`.
- `fetchMechanicExtras`: select `specialisms, approved_at` from `mechanic_cards`.
- `fetchMechanicReviews`: `from('mechanic_public_reviews').select('id, rating, tags, comment, mechanic_response, created_at, reviewer_first_name').eq('mechanic_id', id).order('created_at', { ascending: false })`.
- Add the consent line under the review form: "Your first name, rating and comment may be shown on your mechanic's profile."

## When complete

Tick the boxes above, set the Status line, update `docs/HANDOFF.md`, commit.
