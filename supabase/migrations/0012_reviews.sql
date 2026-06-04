-- 0012_reviews.sql
-- Customer reviews of completed jobs (Task 06 Stage 5). One review per booking;
-- the mechanic may leave a single reply. mechanics.rating is recomputed from
-- these rows by the submit action.
--
-- Idempotent: safe to re-run.

create table if not exists public.reviews (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null references public.bookings(id) on delete cascade,
  customer_id       uuid references public.profiles(id) on delete set null,
  mechanic_id       uuid not null references public.mechanics(id) on delete cascade,
  rating            integer not null check (rating between 1 and 5),
  tags              text[] not null default '{}',
  comment           text,
  mechanic_response text,
  created_at        timestamptz not null default now(),
  -- One review per job — the submit action also guards this, but the constraint
  -- is the backstop against a double submit.
  unique (booking_id)
);

create index if not exists reviews_mechanic_idx
  on public.reviews (mechanic_id, created_at desc);

alter table public.reviews enable row level security;

-- Reads only. Both insert (guest customer, no auth session) and the mechanic's
-- response go through the service-role client in the server actions, after the
-- action verifies booking completion / review ownership — same pattern as the
-- other mechanic + booking writes (see job-offers.ts, reviews.ts).
drop policy if exists "Mechanics can view own reviews" on public.reviews;
create policy "Mechanics can view own reviews" on public.reviews
  for select using (auth.uid() = mechanic_id);

drop policy if exists "Admins can view all reviews" on public.reviews;
create policy "Admins can view all reviews" on public.reviews
  for select using (public.is_admin());
