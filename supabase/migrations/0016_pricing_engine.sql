-- 0016_pricing_engine.sql
-- Task 08 Stage 1 — dynamic pricing engine.
--
-- Replaces "services.starting_price_pence as the booking total" with a
-- calculated total that accounts for an area labour multiplier and per-service
-- commission. Parts pricing is dummy data keyed by area during development; a
-- live parts API replaces it in production (Task 10).
--
-- NOTE: bookings.commission_rate already exists (0008) and is reused as the
-- snapshotted rate — we do NOT add it again here. Surge pricing is NOT part of
-- this platform; there is deliberately no surge column or hook.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- areas — labour multiplier per geographic zone, resolved by postcode prefix.
-- ---------------------------------------------------------------------------
create table if not exists public.areas (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,            -- "London Z1-Z2", "Manchester", ...
  postcode_prefixes text[] not null default '{}', -- ['EC','WC','W1','SW1', ...]; empty = catch-all
  labour_multiplier numeric(4,3) not null default 1.000, -- 1.150 = +15% on labour
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists touch_areas on public.areas;
create trigger touch_areas
  before update on public.areas
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- service_area_prices — per-(service, area) override, dummy parts cost, and an
-- optional per-cell commission rate. A missing row means "use the service's
-- starting price × the area multiplier, default commission, no parts".
-- ---------------------------------------------------------------------------
create table if not exists public.service_area_prices (
  id                  uuid primary key default gen_random_uuid(),
  service_id          uuid references public.services(id) on delete cascade,
  area_id             uuid references public.areas(id) on delete cascade,
  override_price_pence integer,  -- if set, overrides starting_price_pence * labour_multiplier
  parts_price_pence    integer,  -- dummy parts cost for this service in this area (dev only)
  -- per-(service,area) commission override. NULL = inherit the per-service rate
  -- (services.commission_rate), then the platform default (take_rate_base).
  commission_rate      numeric(5,4),
  is_active            boolean not null default true,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (service_id, area_id)
);

create index if not exists service_area_prices_service_idx
  on public.service_area_prices (service_id);
create index if not exists service_area_prices_area_idx
  on public.service_area_prices (area_id);

drop trigger if exists touch_service_area_prices on public.service_area_prices;
create trigger touch_service_area_prices
  before update on public.service_area_prices
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- services — per-service commission rate (editable in the admin pricing page).
-- NULL = use the platform default take rate. Sits between the per-cell override
-- and the platform default in the engine's commission resolution.
-- ---------------------------------------------------------------------------
alter table public.services
  add column if not exists commission_rate numeric(5,4);

-- ---------------------------------------------------------------------------
-- bookings — snapshot the full pricing breakdown at creation time so later
-- pricing changes never apply retroactively. commission_rate already exists.
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists area_id uuid references public.areas(id);
alter table public.bookings
  add column if not exists base_price_pence integer;
alter table public.bookings
  add column if not exists labour_multiplier numeric(4,3) default 1.000;
alter table public.bookings
  add column if not exists parts_price_pence integer not null default 0;
alter table public.bookings
  add column if not exists platform_fee_pence integer;
alter table public.bookings
  add column if not exists mechanic_payout_pence integer;

-- ---------------------------------------------------------------------------
-- RLS — areas + service_area_prices are pricing reference data: world-readable
-- for the active rows (the booking flow needs them), admin-managed for writes.
-- ---------------------------------------------------------------------------
alter table public.areas enable row level security;
alter table public.service_area_prices enable row level security;

drop policy if exists "Anyone can read active areas" on public.areas;
create policy "Anyone can read active areas" on public.areas
  for select using (is_active);

drop policy if exists "Admins manage areas" on public.areas;
create policy "Admins manage areas" on public.areas
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Anyone can read active service prices" on public.service_area_prices;
create policy "Anyone can read active service prices" on public.service_area_prices
  for select using (is_active);

drop policy if exists "Admins manage service prices" on public.service_area_prices;
create policy "Admins manage service prices" on public.service_area_prices
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Seed areas. Prefix matching is longest-prefix-wins in the engine, so the
-- specific Z1-Z2 prefixes (SW1, SE1, ...) beat the broad Z3-Z6 ones (SW, SE).
-- "Default" carries no prefixes and is the catch-all fallback (×1.000).
-- ---------------------------------------------------------------------------
insert into public.areas (name, postcode_prefixes, labour_multiplier) values
  ('London Z1-Z2', array['EC','WC','W1','SW1','SE1','N1','E1','NW1'], 1.150),
  ('London Z3-Z6', array['SW','SE','N','E','NW','W','BR','CR','DA','EN','HA','IG','KT','RM','SM','TW','UB','WD'], 1.050),
  ('Manchester',   array['M'], 1.000),
  ('Rural',        array['IV','KW','PH','LL','SA','LD','TR','TD','DG','EX'], 1.100),
  ('Default',      array[]::text[], 1.000)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Seed dummy parts prices for every (service, area) combination. Parts cost is
-- per-service (a battery costs the same labour-area regardless of postcode in
-- this dev stub); override_price_pence stays null so base = starting × area
-- multiplier, and commission_rate falls back to the platform default by being
-- left at the table default. Re-running is a no-op via the unique constraint.
-- ---------------------------------------------------------------------------
insert into public.service_area_prices (service_id, area_id, parts_price_pence)
select
  s.id,
  a.id,
  case s.slug
    when 'full-service'           then 4500
    when 'interim-service'        then 3200
    when 'front-brake-pads'       then 4800
    when 'front-brake-discs-pads' then 9500
    when 'battery-replacement'    then 8900
    when 'clutch-replacement'     then 16500
    when 'cambelt-replacement'    then 12000
    when 'air-con-regas'          then 2500
    else 0  -- diagnostic, MOT pre-check: labour-only
  end as parts_price_pence
from public.services s
cross join public.areas a
on conflict (service_id, area_id) do nothing;
