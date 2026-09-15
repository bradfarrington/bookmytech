-- ---------------------------------------------------------------------------
-- 0074 — Mechanic profiles and public reviews (Task 51)
--
-- The redesigned mechanic profile (mockups/04, "Mechanic profile") shows
-- specialisms, when they joined, and other customers' reviews. A customer could
-- read none of those: `mechanics` has no customer policy (and must not get one:
-- it holds base_postcode and the stripe_* columns), and `reviews` is readable
-- only for the customer's own bookings (0046).
--
-- 1. `mechanic_cards` (0048) gains `specialisms` and `approved_at`, APPENDED so
--    every existing column keeps its position and type. Same gate as before:
--    only mechanics on the caller's own bookings.
--
-- 2. `reviews.is_public`, default true: reviews publish automatically, and an
--    admin can hide one (/admin/reviews, "Shown on profile"). Who hid it and
--    when is recorded.
--
-- 3. `mechanic_public_reviews`, a view in the same pattern as mechanic_cards
--    (owner privileges, column allow-list, gated by has_booking_with_mechanic):
--    a mechanic's public reviews that have a comment, with the reviewer's first
--    name only. Reviews by customers who deleted their account are left out.
--
-- The review forms (web and app) tell the customer their first name, rating and
-- comment may be shown on the mechanic's profile.
--
-- ⚠️ SCHEMA CHANGE: the customer app regenerates its types (`npm run db:types`).
-- Nothing an existing build reads changes shape.
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

-- 1. mechanic_cards extras --------------------------------------------------
create or replace view public.mechanic_cards as
select
  m.id,
  p.full_name,
  p.avatar_url,
  m.rating,
  m.job_count,
  m.is_pro,
  m.bio,
  -- A personal mobile can't be un-shared once given out, so it's visible only
  -- while there is a live job to call about.
  case when public.has_live_booking_with_mechanic(m.id) then p.phone end as phone,
  -- Task 51, appended: informational since dispatch stopped filtering on them.
  m.specialisms,
  -- When they were approved to take jobs: "Joined 2 years ago".
  m.approved_at
from public.mechanics m
join public.profiles p on p.id = m.id
where public.has_booking_with_mechanic(m.id);

-- 2. reviews.is_public ------------------------------------------------------
alter table public.reviews
  add column if not exists is_public boolean not null default true,
  add column if not exists visibility_changed_at timestamptz,
  add column if not exists visibility_changed_by uuid references public.profiles(id);

comment on column public.reviews.is_public is
  'Shown on the mechanic''s profile to other customers (Task 51). Default true; an admin can hide a review. The rating counts towards the average either way.';

-- 3. mechanic_public_reviews --------------------------------------------------
create or replace view public.mechanic_public_reviews as
select
  r.id,
  r.mechanic_id,
  r.rating,
  r.tags,
  r.comment,
  r.mechanic_response,
  r.created_at,
  -- First name only. Null for a guest-era review with no account behind it.
  nullif(split_part(btrim(coalesce(p.full_name, '')), ' ', 1), '') as reviewer_first_name
from public.reviews r
left join public.profiles p on p.id = r.customer_id
where r.is_public
  and r.comment is not null
  and btrim(r.comment) <> ''
  and (p.id is null or p.deleted_at is null)
  and public.has_booking_with_mechanic(r.mechanic_id);

revoke all on table public.mechanic_public_reviews from anon;
grant select on table public.mechanic_public_reviews to authenticated;

comment on view public.mechanic_public_reviews is
  'Task 51: a mechanic''s public reviews with a comment, reviewer first name only, for customers who have booked that mechanic. Owner privileges; gated like mechanic_cards.';
