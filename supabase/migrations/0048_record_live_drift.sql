-- 0048_record_live_drift.sql
-- Write down what is on the live database and in no migration (Task 19 / P2).
--
-- WHAT THIS IS
--
-- On 2026-07-30 the mobile app's phase-4 work added a mechanic live-location
-- table, a customer-safe view of a mechanic, a DVLA lookup cache and six helper
-- functions to the dev project. The app's build plan records them as CRM
-- migrations "0044/0045" — but in this repo 0044 and 0045 are the mobile
-- rate-limit seeds, and nothing here creates any of it. Same shape of drift as
-- the `reviews` policy 0046 fixed, only larger. Diffed 2026-08-26 by reading the
-- live PostgREST schema (every public table, view and RPC) against every
-- `create table|view|function` in this directory. Live-and-unmigrated:
--
--   tables     mechanic_locations · dvla_vehicle_cache
--   view       mechanic_cards
--   functions  owns_booking · has_booking_with_mechanic
--              has_live_booking_with_mechanic · can_track_mechanic
--              purge_stale_mechanic_locations · purge_stale_dvla_cache
--
-- Nothing is migrated-and-missing except the tables 0040 deliberately dropped.
--
-- HOW FAITHFUL THIS IS — read before applying
--
-- Column names, types, nullability and every function's signature and return
-- type are copied from the live schema exactly (the app's generated types and
-- the PostgREST OpenAPI document agree). The function BODIES and POLICY
-- expressions could not be read back — this checkout has no SQL access to the
-- project — so they are reconstructed from the contract the app was built
-- against and documents (bmt-customer-app/docs/00-build-plan.md, phase 4/5):
--
--   • a customer can read a mechanic's row ONLY while their booking with that
--     mechanic is `en_route` (not `in_progress` — once the mechanic is on site
--     the customer can see them out of the window), only while the fix is under
--     five minutes old, and only while the mechanic is sharing;
--   • `updated_at` is trigger-stamped so a token holder cannot park a stale
--     position and keep it visible;
--   • rows older than six hours are purged by an hourly cron;
--   • `mechanic_cards` shows a customer only name, avatar, rating, job count,
--     Pro flag and bio for mechanics on their OWN bookings, and `phone` only
--     while that booking is `en_route` or `in_progress` — parity with the web
--     call button. Never the `profiles`/`mechanics` rows themselves: RLS is
--     row-level, so a policy on those would hand over referral_code,
--     base_postcode, is_suspended and the stripe_* columns with the name.
--
-- Everything is `create or replace` / `drop policy if exists` / `if not exists`,
-- so applying this to the dev project REPLACES the hand-made definitions with
-- the ones written here and the repo becomes the source of truth. On a fresh
-- environment it creates them. `scripts/verify-mechanic-visibility.mjs` proves
-- the contract above against whichever definitions are live — run it after
-- applying, because a live position is the one thing here that must not leak.
--
-- ⚠️ SCHEMA CHANGE — the mobile app regenerates its types from the live schema
-- (`npm run db:types` there). Nothing here changes a column the app already
-- reads; it should regenerate to a no-op diff.

-- ---------------------------------------------------------------------------
-- 1. Ownership helpers. SECURITY DEFINER so they can read `bookings` from
--    inside a policy on ANOTHER table without that table's policies recursing
--    into the caller's bookings policy (RLS pattern #1). Each answers a question
--    only about the CALLER — auth.uid() / auth.email() — so exposing them to
--    `authenticated` gives away nothing about anyone else.
-- ---------------------------------------------------------------------------

-- "Is this my booking?" — the two arms of "Customers can view own bookings"
-- (0003), usable from any policy. The live `reviews` customer policy calls it.
create or replace function public.owns_booking(p_booking_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.bookings b
     where b.id = p_booking_id
       and (
         b.customer_id = auth.uid()
         or (b.customer_id is null and b.customer_email = auth.email())
       )
  );
$$;

-- "Have I ever booked this mechanic?" — gates the mechanic_cards view.
create or replace function public.has_booking_with_mechanic(p_mechanic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.bookings b
     where b.mechanic_id = p_mechanic_id
       and (
         b.customer_id = auth.uid()
         or (b.customer_id is null and b.customer_email = auth.email())
       )
  );
$$;

-- "Is this mechanic on a live job of mine right now?" — en_route or
-- in_progress. Gates the phone number on mechanic_cards.
create or replace function public.has_live_booking_with_mechanic(p_mechanic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.bookings b
     where b.mechanic_id = p_mechanic_id
       and b.status in ('en_route', 'in_progress')
       and (
         b.customer_id = auth.uid()
         or (b.customer_id is null and b.customer_email = auth.email())
       )
  );
$$;

-- "May I see where this mechanic is?" — en_route ONLY. Purpose limitation: the
-- position exists to answer "when will they arrive", and that question is over
-- the moment they arrive.
create or replace function public.can_track_mechanic(p_mechanic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.bookings b
     where b.mechanic_id = p_mechanic_id
       and b.status = 'en_route'
       and (
         b.customer_id = auth.uid()
         or (b.customer_id is null and b.customer_email = auth.email())
       )
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. mechanic_locations — ONE row per mechanic holding the LATEST fix, not a
--    trail. Written by the mechanic's own app (separate repo) while on a job;
--    read by the customer app's map card over Realtime (0049 publishes it).
-- ---------------------------------------------------------------------------
create table if not exists public.mechanic_locations (
  mechanic_id     uuid primary key references public.mechanics(id) on delete cascade,
  lat             double precision not null,
  lng             double precision not null,
  accuracy_m      real,
  heading_deg     real,
  speed_mps       real,
  sharing_enabled boolean not null default true,
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

-- Stamped server-side on EVERY write, ignoring any value the client sent. The
-- five-minute read window below is measured from this column, so if a client
-- could set it, a stale position could be kept visible indefinitely.
drop trigger if exists mechanic_locations_touch_updated_at on public.mechanic_locations;
create trigger mechanic_locations_touch_updated_at
  before insert or update on public.mechanic_locations
  for each row execute function public.touch_updated_at();

alter table public.mechanic_locations enable row level security;

-- The customer read. All three conditions, always: sharing on, fix fresh, job
-- en_route. Note what this means for Realtime — a mechanic switching sharing
-- OFF is an UPDATE whose new row fails this policy, so the subscriber receives
-- NO event. The app hides the marker after 60s of silence for exactly that
-- reason; deleting the row is the revocation that does emit an event.
drop policy if exists "Customers track their en-route mechanic" on public.mechanic_locations;
create policy "Customers track their en-route mechanic" on public.mechanic_locations
  for select using (
    sharing_enabled
    and updated_at > now() - interval '5 minutes'
    and public.can_track_mechanic(mechanic_id)
  );

-- The mechanic owns their row outright.
drop policy if exists "Mechanics read own location" on public.mechanic_locations;
create policy "Mechanics read own location" on public.mechanic_locations
  for select using (auth.uid() = mechanic_id);

drop policy if exists "Mechanics insert own location" on public.mechanic_locations;
create policy "Mechanics insert own location" on public.mechanic_locations
  for insert with check (auth.uid() = mechanic_id);

drop policy if exists "Mechanics update own location" on public.mechanic_locations;
create policy "Mechanics update own location" on public.mechanic_locations
  for update using (auth.uid() = mechanic_id) with check (auth.uid() = mechanic_id);

drop policy if exists "Mechanics delete own location" on public.mechanic_locations;
create policy "Mechanics delete own location" on public.mechanic_locations
  for delete using (auth.uid() = mechanic_id);

drop policy if exists "Admins read all locations" on public.mechanic_locations;
create policy "Admins read all locations" on public.mechanic_locations
  for select using (public.is_admin());

-- Housekeeping. A row nobody has touched for six hours is a mechanic who went
-- home; the read policy already hides it after five minutes, this just stops
-- the table being a log of everyone's last known whereabouts.
create or replace function public.purge_stale_mechanic_locations(p_max_age interval default interval '6 hours')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  purged integer;
begin
  delete from public.mechanic_locations
   where updated_at < now() - p_max_age;
  get diagnostics purged = row_count;
  return purged;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. mechanic_cards — what a customer may know about a mechanic. RLS pattern #3
--    (docs/02-data-model.md): a VIEW over profiles + mechanics that runs with
--    its owner's privileges (the default; deliberately NOT security_invoker),
--    exposing a column allow-list and filtered to mechanics on the caller's own
--    bookings by the SECURITY DEFINER helpers above. The underlying tables keep
--    their existing self/admin-only policies.
-- ---------------------------------------------------------------------------
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
  case when public.has_live_booking_with_mechanic(m.id) then p.phone end as phone
from public.mechanics m
join public.profiles p on p.id = m.id
where public.has_booking_with_mechanic(m.id);

-- ---------------------------------------------------------------------------
-- 4. dvla_vehicle_cache — shared cache in front of DVLA VES + DVSA MOT, keyed
--    on the normalised reg. Service-role only (RLS on, no policies): the
--    lookup route reads and writes it through the admin client. NB: as of this
--    migration nothing in lib/dvla/ reads it yet — see Task 18 follow-ups; the
--    table is recorded because it is live and in the app's generated types.
-- ---------------------------------------------------------------------------
create table if not exists public.dvla_vehicle_cache (
  reg            text primary key,
  ves_details    jsonb,
  ves_fetched_at timestamptz,
  mot_model      text,
  mot_fetched_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

drop trigger if exists dvla_vehicle_cache_touch_updated_at on public.dvla_vehicle_cache;
create trigger dvla_vehicle_cache_touch_updated_at
  before update on public.dvla_vehicle_cache
  for each row execute function public.touch_updated_at();

alter table public.dvla_vehicle_cache enable row level security;

create or replace function public.purge_stale_dvla_cache(p_max_age interval default interval '48 hours')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  purged integer;
begin
  delete from public.dvla_vehicle_cache
   where updated_at < now() - p_max_age;
  get diagnostics purged = row_count;
  return purged;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The purge crons. pg_cron, not a Next route + vercel.json like the app's
--    other crons, because both jobs are pure database housekeeping with no
--    application code to run — and because that is how they were scheduled on
--    the dev project. Guarded so the migration still applies where the
--    extension isn't enabled (local Supabase, a fresh project); on those the
--    purge simply never runs, and the five-minute read policy still holds.
--    `cron.schedule(name, …)` upserts by name, so re-running is safe.
-- ---------------------------------------------------------------------------
do $outer$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'purge-stale-mechanic-locations',
      '0 * * * *',
      $job$ select public.purge_stale_mechanic_locations(); $job$
    );
    perform cron.schedule(
      'purge-stale-dvla-cache',
      '15 3 * * *',
      $job$ select public.purge_stale_dvla_cache(); $job$
    );
  end if;
end
$outer$;
