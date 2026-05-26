-- Task 04 Stage 1 — mechanics extension table + booking lifecycle columns.
--
-- Adds:
--   1. `mechanics` table (1:1 with profiles for users with role='mechanic')
--   2. Lifecycle timestamp columns on bookings: en_route_at, started_at, completed_at
--   3. A derived `area` column on bookings (postcode district, e.g. "SE15") with
--      a trigger so it's always in sync with `postcode` — never trust the writer
--   4. A CHECK constraint pinning bookings.status to the agreed enum
--
-- RLS follows the canonicalised patterns in docs/02-data-model.md — admin checks
-- use public.is_admin() (pattern #1), never inline EXISTS subqueries on profiles.
--
-- Idempotent: safe to re-run.

-- 1. Shared updated_at trigger function (also used by future tables)
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. mechanics table
create table if not exists mechanics (
  id uuid primary key references profiles(id) on delete cascade,
  status text not null default 'offline'
    check (status in ('offline', 'online', 'on_job')),
  service_radius_miles integer not null default 10
    check (service_radius_miles between 1 and 100),
  base_postcode text,
  bio text,
  specialisms text[] not null default '{}',
  rating numeric(3, 2) not null default 0
    check (rating between 0 and 5),
  job_count integer not null default 0
    check (job_count >= 0),
  is_pro boolean not null default false,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists mechanics_touch_updated_at on mechanics;
create trigger mechanics_touch_updated_at
  before update on mechanics
  for each row execute function public.touch_updated_at();

alter table mechanics enable row level security;

-- Pattern #2: when a feature needs an admin override on top of a row-scoped
-- policy, both policies are required. Mechanics SELECT-own + admin SELECT-all.
drop policy if exists "Mechanics can view own record" on mechanics;
create policy "Mechanics can view own record" on mechanics
  for select using (auth.uid() = id);

drop policy if exists "Admins can view all mechanics" on mechanics;
create policy "Admins can view all mechanics" on mechanics
  for select using (public.is_admin());

drop policy if exists "Admins can insert mechanics" on mechanics;
create policy "Admins can insert mechanics" on mechanics
  for insert with check (public.is_admin());

drop policy if exists "Admins can update mechanics" on mechanics;
create policy "Admins can update mechanics" on mechanics
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Mechanics can update own status" on mechanics;
create policy "Mechanics can update own status" on mechanics
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Admins can delete mechanics" on mechanics;
create policy "Admins can delete mechanics" on mechanics
  for delete using (public.is_admin());

-- 3. Booking lifecycle columns
alter table bookings
  add column if not exists area text,
  add column if not exists en_route_at timestamptz,
  add column if not exists started_at timestamptz,
  add column if not exists completed_at timestamptz;

-- 4. Postcode → area derivation. UK postcode district == the outward code
--    (the bit before the space): "SE15 5DT" → "SE15", "M1 1AB" → "M1".
create or replace function public.derive_postcode_district(p text)
returns text
language sql
immutable
as $$
  select case
    when p is null or btrim(p) = '' then null
    else upper(split_part(btrim(p), ' ', 1))
  end;
$$;

create or replace function public.set_booking_area()
returns trigger
language plpgsql
as $$
begin
  new.area = public.derive_postcode_district(new.postcode);
  return new;
end;
$$;

drop trigger if exists bookings_set_area on bookings;
create trigger bookings_set_area
  before insert or update of postcode on bookings
  for each row execute function public.set_booking_area();

-- Backfill area for rows that pre-date the trigger.
update bookings
   set area = public.derive_postcode_district(postcode)
 where area is null and postcode is not null;

-- 5. Status CHECK constraint.
--    Booking lifecycle:
--      sourcing_mechanic — PI authorised, no mechanic assigned yet (default on insert)
--      confirmed         — mechanic accepted the job
--      en_route          — mechanic on the way (started timer)
--      in_progress       — mechanic on site, working
--      completed         — mechanic marked complete, customer signed off
--      cancelled         — cancelled (by customer, admin, or expired auth)
--      disputed          — flagged by customer for admin review
--
-- Normalise any stray legacy values first to avoid the CHECK rejecting the
-- existing data. Anything unexpected falls back to sourcing_mechanic.
update bookings
   set status = 'sourcing_mechanic'
 where status not in (
   'sourcing_mechanic', 'confirmed', 'en_route',
   'in_progress', 'completed', 'cancelled', 'disputed'
 );

alter table bookings drop constraint if exists bookings_status_check;
alter table bookings
  add constraint bookings_status_check
  check (status in (
    'sourcing_mechanic', 'confirmed', 'en_route',
    'in_progress', 'completed', 'cancelled', 'disputed'
  ));
