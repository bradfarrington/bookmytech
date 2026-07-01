-- 0033_hourly_pricing.sql
-- Duration-based pricing.
--
-- The labour/service amount is no longer a fixed per-service price. It's the
-- service's duration (in hours) multiplied by a single GLOBAL hourly rate
-- (platform_settings.hourly_rate_pence, seeded at £60 = 6000p):
--
--   service_amount = resolved_duration_hours × hourly_rate_pence
--   total          = service_amount + parts          (unchanged — Task 10)
--   fee            = round(total × commission_rate)   (unchanged — from total)
--   payout         = total − fee                      (unchanged)
--
-- Duration can be overridden per (service, area) so the same job takes — and
-- therefore costs — differently in different postcodes. The old area
-- labour_multiplier is NO LONGER applied to price; areas remain only to resolve
-- a postcode to its per-area duration override (and parts / commission cells).
--
-- services.starting_price_pence is retained as a CACHED indicative price
-- (= round(default duration × hourly rate)). It is recomputed whenever a
-- service's duration or the global rate changes and must never be edited
-- directly — all the customer-facing "from £X" previews still read it.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- services — default duration in hours (the source of truth for labour).
-- ---------------------------------------------------------------------------
alter table public.services
  add column if not exists duration_hours numeric(4,2);

-- ---------------------------------------------------------------------------
-- service_area_prices — per-(service,area) duration override. NULL = inherit
-- the service's default duration. Sits where the labour portion used to be
-- decided by override_price_pence × labour_multiplier; override_price_pence
-- remains as an optional HARD price override that trumps the duration calc.
-- ---------------------------------------------------------------------------
alter table public.service_area_prices
  add column if not exists duration_hours numeric(4,2);

-- ---------------------------------------------------------------------------
-- bookings — snapshot the duration + rate that produced this booking's labour
-- amount, alongside the existing base/fee/payout snapshot columns (0016). The
-- legacy labour_multiplier column stays (defaults 1.000) but is no longer set.
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists service_duration_hours numeric(4,2);
alter table public.bookings
  add column if not exists hourly_rate_pence integer;

-- ---------------------------------------------------------------------------
-- Global hourly rate (£60 = 6000p). Generic key in the existing JSONB store;
-- read by lib/pricing/calculate.ts:getHourlyRatePence.
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value)
values ('hourly_rate_pence', '6000'::jsonb)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Seed DUMMY durations for the existing catalogue. These are placeholders — the
-- owner sets real durations (and per-area overrides) in admin before go-live.
-- ---------------------------------------------------------------------------
update public.services s set duration_hours = d.hours
from (values
  ('full-service',           3.00),
  ('diagnostic',             1.00),
  ('front-brake-pads',       1.50),
  ('battery-replacement',    1.00),
  ('clutch-replacement',     4.00),
  ('mot-precheck',           1.00),
  ('interim-service',        2.00),
  ('front-brake-discs-pads', 2.00),
  ('cambelt-replacement',    4.00),
  ('air-con-regas',          1.50)
) as d(slug, hours)
where s.slug = d.slug;

-- Any custom-added service not covered above gets a 1h dummy so none are null.
update public.services
  set duration_hours = 1.00
  where duration_hours is null;

-- Recompute the cached indicative price from duration × the seeded global rate.
update public.services
  set starting_price_pence = round(duration_hours * 6000)::int,
      updated_at = now()
  where duration_hours is not null;
