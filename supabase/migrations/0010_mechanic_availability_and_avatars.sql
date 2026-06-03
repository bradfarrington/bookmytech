-- 0010_mechanic_availability_and_avatars.sql
-- Task 05 Stage 6 — mechanic availability + profile.
--
-- Adds: a weekly working-hours table, an avatar_url on profiles, a self-update
-- policy so a mechanic can edit their own profile, and a public 'avatars'
-- storage bucket for profile photos.
--
-- Mechanics already have a full own-row UPDATE on `mechanics` ("Mechanics can
-- update own status", 0004 — not column-restricted), so service_radius_miles,
-- specialisms and bio edits need no new policy there.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- Weekly working hours. One row per (mechanic, day). day_of_week: 0 = Sunday,
-- 6 = Saturday (JS getDay()). A missing row means "not set" — treated as the
-- default availability by the UI.
-- ---------------------------------------------------------------------------
create table if not exists public.mechanic_availability (
  mechanic_id uuid not null references public.mechanics(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  start_time  time,
  end_time    time,
  is_active   boolean not null default true,
  updated_at  timestamptz not null default now(),
  primary key (mechanic_id, day_of_week)
);

alter table public.mechanic_availability enable row level security;

-- Mechanic manages their own rows; admins read all (pattern #2).
drop policy if exists "Mechanics manage own availability" on public.mechanic_availability;
create policy "Mechanics manage own availability" on public.mechanic_availability
  for all using (auth.uid() = mechanic_id) with check (auth.uid() = mechanic_id);

drop policy if exists "Admins can view all availability" on public.mechanic_availability;
create policy "Admins can view all availability" on public.mechanic_availability
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Profile photo. URL points at an object in the public 'avatars' bucket below.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists avatar_url text;

-- Let a user edit their own profile (name, phone, avatar). Plain self-scoped
-- predicate — no profiles subquery, so no recursion (see 0006).
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- Public avatars bucket. Uploads go through the service-role client in the
-- server action (after verifying the owner), so no per-object storage policies
-- are needed for writes; public = true serves reads without auth.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;
