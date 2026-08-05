-- 0046_customer_review_reads.sql
-- Task 18 Stage 5 — record the customer SELECT policy on `reviews` in a
-- migration, because the live database has one and this repo does not.
--
-- WHAT'S ACTUALLY GOING ON HERE
--
-- `reviews` (0012) shipped with SELECT policies for mechanics and admins only,
-- and that is still all any migration in this repo creates. But the dev project
-- DOES let a signed-in customer read their own reviews — verified live on
-- 2026-08-05, for both an account-owned review and a guest one (customer_id
-- null, matched through the booking's email). So a policy was added by hand at
-- some point and never written down.
--
-- That drift is the problem this fixes. The mobile app reads its data straight
-- from Supabase under the customer's own RLS, so "show the review you left on
-- this job" is a policy and not an endpoint — and a policy that exists only in
-- one environment is a feature that works in testing and vanishes on a fresh
-- one. Worse, it would vanish SILENTLY: RLS returns zero rows, not an error, so
-- the app would read "you haven't reviewed this yet" and put the customer
-- through leaving the same review twice.
--
-- So this migration is expected to be a NO-OP on dev and load-bearing anywhere
-- the hand-made policy isn't. Applying it is still worth doing: if the live
-- policy carries this name it is replaced with the definition below, and if it
-- carries another name the two simply OR together, which is what permissive
-- policies do. Neither outcome can narrow what a customer can already read.
--
-- READS ONLY. Writes still go through the service-role client in
-- lib/reviews/submit-review.ts, because submitting also recomputes
-- `mechanics.rating` and `mechanics.job_count` — figures no customer may write.
-- That is why this cannot be an INSERT policy.
--
-- The two arms mirror "Customers can view own bookings" (0003) exactly: an
-- account-owned review matches on `customer_id`, and a review left against a
-- GUEST booking (no `customer_id`, only an email) matches through the booking on
-- `auth.email()`. `reviews.customer_id` is nullable and is null for every guest
-- review, so the first arm alone would hide precisely the reviews most likely to
-- exist before someone made an account.
--
-- Idempotent: safe to re-run.

drop policy if exists "Customers can view own reviews" on public.reviews;
create policy "Customers can view own reviews" on public.reviews
  for select using (
    customer_id = auth.uid()
    or exists (
      select 1
        from public.bookings b
       where b.id = reviews.booking_id
         and (
           b.customer_id = auth.uid()
           or (b.customer_id is null and b.customer_email = auth.email())
         )
    )
  );
