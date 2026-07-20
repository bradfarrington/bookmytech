-- 0040_remove_services.sql
-- Remove the packaged-services catalogue entirely (owner decision 2026-07-20).
--
-- Every booking is now a HaynesPro repair: the customer browses the
-- repair-times tree for THEIR car and books a single operation, priced from
-- the OEM book time (billed whole hours × the global hourly rate). The
-- services/service_categories catalogue, per-(service,area) pricing overrides,
-- per-service time mappings, per-model service toggles and per-service parts
-- config are all dead concepts.
--
-- What survives:
--   • bookings.repair_node_id / repair_description  (0038) — now the ONLY
--     identity a booking has. Legacy service bookings get repair_description
--     backfilled from their service's name below so history still displays.
--   • repair_vehicle_exclusions (0039) — per-model repair on/off toggles.
--   • parts + booking_parts (0021) — the catalogue and per-booking snapshots
--     stay (mechanic-agreed parts); only the per-service auto-config goes.
--   • mechanics.specialisms / mechanic_applications.specialisms — kept as
--     informational text (vetting context); dispatch no longer filters on
--     them (every repair booking broadcasts to all mechanics in range).
--   • All price snapshot columns on bookings (0016/0033/0036) — historical.
--
-- Idempotent: safe to re-run.

-- 1. Snapshot the display name onto legacy service bookings BEFORE the join
--    target disappears. Every job surface reads repair_description only.
update public.bookings b
set repair_description = s.name
from public.services s
where b.service_id = s.id
  and (b.repair_description is null or b.repair_description = '');

-- Safety net: any row the join couldn't name (service hard-deleted before
-- this migration) still gets a label.
update public.bookings
set repair_description = 'Vehicle service'
where repair_description is null or repair_description = '';

-- 2. Drop the FK column — a uuid pointing at a dropped table means nothing.
alter table public.bookings drop column if exists service_id;

-- 3. Per-service HaynesPro duration cache on the vehicle row (serviceId → raw
--    hours). Repairs quote straight from the node id; the map is dead.
alter table public.haynespro_vehicle_cache drop column if exists durations;

-- 4. Drop every service-keyed table, dependents first.
drop table if exists public.service_parts;              -- 0021
drop table if exists public.service_time_mappings;      -- 0036
drop table if exists public.service_vehicle_exclusions; -- 0037
drop table if exists public.service_area_prices;        -- 0016
drop table if exists public.services;                   -- foundation
drop table if exists public.service_categories;         -- 0002
