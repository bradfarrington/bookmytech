-- ---------------------------------------------------------------------------
-- Manual vehicle selection (Task 20).
--
-- Reg → HaynesPro car type is a FUZZY MATCH (lib/haynespro/vehicle.ts), and on
-- a long DVLA model string the engine variant it lands on is a guess between
-- several plausible ones. A wrong variant means wrong labour times, which means
-- a wrong price. `POST /api/mobile/v1/vehicle/resolve` lets a customer correct
-- it by picking the real vehicle out of HaynesPro's own MAKE → MODEL → TYPE
-- tree; the correction is written straight into `haynespro_vehicle_cache`,
-- which every priced path already reads.
--
-- ⚠️ SCHEMA CHANGE — the mobile app generates its TypeScript types from the
-- live schema, so `npm run db:types` must be re-run there after this applies.
-- Both new columns are nullable and the check constraint only widens, so no
-- existing row, query or app build breaks.
--
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. `resolved_via` gains 'manual'.
--
-- It is not just provenance: it is the DON'T-RE-RESOLVE flag. `resolveVehicle`
-- treats a 'manual' row as authoritative and never overwrites it from DVLA
-- details, and ignores its expiry — a correction that lapsed after 30 days
-- would silently revert the price to the wrong guess, which is the exact bug
-- this feature exists to fix. (The writer also stamps `expires_at` far future,
-- so the rule holds even for a reader that doesn't know it.)
--
-- 0036 created the constraint inline, so Postgres named it
-- `haynespro_vehicle_cache_resolved_via_check`. Dropped by name and rebuilt
-- rather than altered — a check constraint can't be modified in place.
-- ---------------------------------------------------------------------------
alter table public.haynespro_vehicle_cache
  drop constraint if exists haynespro_vehicle_cache_resolved_via_check;

alter table public.haynespro_vehicle_cache
  add constraint haynespro_vehicle_cache_resolved_via_check
  check (resolved_via in ('vin', 'details', 'manual'));

-- ---------------------------------------------------------------------------
-- 2. The audit trail — set on manual rows only.
--
-- The cache is global and keyed on the reg alone: one person's correction moves
-- that plate's price for everyone who books it, website included. Without these
-- two columns a mispriced booking is untraceable — you cannot tell a bad fuzzy
-- match from a deliberate correction, or say who made it.
--
-- `on delete set null` because a deleted account must not take the vehicle
-- resolution (and so the price of every future booking on that plate) with it.
-- ---------------------------------------------------------------------------
alter table public.haynespro_vehicle_cache
  add column if not exists resolved_by uuid references public.profiles(id) on delete set null;

alter table public.haynespro_vehicle_cache
  add column if not exists resolved_at timestamptz;

comment on column public.haynespro_vehicle_cache.resolved_by is
  'Customer who chose this vehicle by hand (resolved_via = ''manual''). Null for fuzzy-matched rows.';
comment on column public.haynespro_vehicle_cache.resolved_at is
  'When the manual correction was made. Null for fuzzy-matched rows.';

-- No RLS change: the table has row level security on and no policies, so it
-- stays service-role only. Customers reach it exclusively through the route
-- handler, which authenticates the caller and enforces the DVLA make guard.

-- ---------------------------------------------------------------------------
-- 3. Rate limits for the new `vehicle` family (DATA ONLY — no schema change).
--
-- Same mechanism as 0043–0047: values live in platform_settings so they are
-- tunable without a redeploy, and lib/rate-limit/limiter.ts carries identical
-- defaults in code so the endpoint is still limited if this seed hasn't run.
--
-- Tighter than every other family on purpose. `POST /vehicle/resolve` is the
-- only customer-reachable write to SHARED pricing state, so the cost of a loop
-- here is not a supplier bill, it is other people's prices moving. The three
-- picker reads (`/vehicle/makes`, `/models`, `/types`) are unauthenticated and
-- count against the existing `mobile_catalogue_*` buckets instead — they are
-- memoised reads of a supplier catalogue, no different from browsing repairs.
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value) values
  ('mobile_vehicle_user_burst', '5'::jsonb),    -- per user, per 60s
  ('mobile_vehicle_user_daily', '20'::jsonb),   -- per user, per 24h
  ('mobile_vehicle_ip_burst',   '10'::jsonb),   -- per IP,   per 60s
  ('mobile_vehicle_ip_daily',   '60'::jsonb)    -- per IP,   per 24h
on conflict (key) do nothing;
