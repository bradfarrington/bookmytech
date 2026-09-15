-- ---------------------------------------------------------------------------
-- 0073 — The garage: a customer's saved vehicles (Task 50)
--
-- Until now "saved vehicles" were derived from bookings on every page load, so
-- a customer couldn't add a car before booking it, name it, or remove one they
-- sold. This table is the garage.
--
-- WHO WRITES WHAT
--   • Adding a vehicle goes through the server (the website's garage action,
--     POST /api/mobile/v1/garage), which looks the registration up with DVLA
--     first. So INSERT is not granted to customers.
--   • The DVLA details (make, model, MOT and tax dates) are written by the
--     server only, refreshed at most once a day (lib/garage/). A customer can't
--     edit them: the MOT warning on the garage card must be DVLA's date, not a
--     typed one. Column privileges enforce this, not just the clients.
--   • The customer may rename (nickname) and remove their own vehicles
--     directly, from either client.
--   • A signed-in booking adds its vehicle if it isn't already there
--     (lib/bookings/create-booking.ts), so the garage fills itself.
--
-- The backfill below seeds each customer's garage from their past bookings.
--
-- delete_customer_account() deletes these rows (0077).
--
-- ⚠️ SCHEMA CHANGE: the customer app regenerates its types (`npm run db:types`).
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

create table if not exists public.customer_vehicles (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references public.profiles(id) on delete cascade,
  -- Normalised: uppercase, no spaces ("S28BSW"). Clients format it for display.
  registration        text not null,
  -- "The school run car". The one column a customer can write.
  nickname            text,
  -- DVLA details, server-written. Null until the first lookup succeeds.
  make                text,
  model               text,
  colour              text,
  fuel_type           text,
  year_of_manufacture integer,
  mot_status          text,
  mot_expiry_date     date,
  tax_status          text,
  tax_due_date        date,
  -- When DVLA was last asked (a "not found" answer counts). Drives the daily refresh.
  details_checked_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint customer_vehicles_registration_shape check (registration ~ '^[A-Z0-9]{2,8}$'),
  constraint customer_vehicles_nickname_length check (nickname is null or char_length(nickname) between 1 and 30),
  constraint customer_vehicles_one_per_registration unique (customer_id, registration)
);

comment on table public.customer_vehicles is
  'A customer''s garage (Task 50). Added by the server after a DVLA lookup; DVLA columns are server-written; the customer may set nickname and delete.';

create or replace function public.customer_vehicles_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.registration := upper(regexp_replace(coalesce(new.registration, ''), '\s+', '', 'g'));
  new.nickname     := nullif(btrim(new.nickname), '');
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists customer_vehicles_before_write on public.customer_vehicles;
create trigger customer_vehicles_before_write
  before insert or update on public.customer_vehicles
  for each row execute function public.customer_vehicles_before_write();

-- ---------------------------------------------------------------------------
-- Privileges and RLS.
--
-- Supabase grants every table to anon and authenticated by default; RLS then
-- filters rows. Here the COLUMNS matter too, so table-level INSERT and UPDATE
-- are revoked and UPDATE is granted back on `nickname` alone. A PostgREST
-- update naming any other column is refused with 42501.
-- ---------------------------------------------------------------------------
alter table public.customer_vehicles enable row level security;
revoke all on table public.customer_vehicles from anon;
revoke insert, update on table public.customer_vehicles from authenticated;
grant update (nickname) on table public.customer_vehicles to authenticated;

drop policy if exists "Customers read own vehicles" on public.customer_vehicles;
create policy "Customers read own vehicles" on public.customer_vehicles
  for select using (auth.uid() = customer_id);

drop policy if exists "Customers rename own vehicles" on public.customer_vehicles;
create policy "Customers rename own vehicles" on public.customer_vehicles
  for update using (auth.uid() = customer_id) with check (auth.uid() = customer_id);

drop policy if exists "Customers remove own vehicles" on public.customer_vehicles;
create policy "Customers remove own vehicles" on public.customer_vehicles
  for delete using (auth.uid() = customer_id);

drop policy if exists "Admins read all vehicles" on public.customer_vehicles;
create policy "Admins read all vehicles" on public.customer_vehicles
  for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Backfill: every distinct vehicle on a customer's bookings, with the make and
-- model from the most recent one. DVLA details stay null; the first garage view
-- fills them. Deleted accounts are skipped.
-- ---------------------------------------------------------------------------
insert into public.customer_vehicles (customer_id, registration, make, model, created_at)
select distinct on (b.customer_id, b.reg)
       b.customer_id,
       b.reg,
       nullif(btrim(b.vehicle_make), ''),
       nullif(btrim(b.vehicle_model), ''),
       b.created_at
  from (
    select customer_id,
           upper(regexp_replace(coalesce(vehicle_reg, ''), '\s+', '', 'g')) as reg,
           vehicle_make,
           vehicle_model,
           created_at
      from public.bookings
     where customer_id is not null
  ) b
  join public.profiles p
    on p.id = b.customer_id
   and p.role = 'customer'
   and p.deleted_at is null
 where b.reg ~ '^[A-Z0-9]{2,8}$'
 order by b.customer_id, b.reg, b.created_at desc
on conflict (customer_id, registration) do nothing;
