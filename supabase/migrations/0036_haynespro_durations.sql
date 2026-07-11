-- 0036_haynespro_durations.sql
-- HaynesPro vehicle-specific durations (Task 16).
--
-- Labour duration can now come from HaynesPro OEM book times for the ACTUAL
-- vehicle (resolved from the booking reg). Two new tables plus two booking
-- snapshot columns:
--
--   haynespro_vehicle_cache  — one row per normalised reg: the resolved
--                              HaynesPro car type + repairtime type, plus a
--                              lazily-filled jsonb map of serviceId → raw
--                              duration hours. Rows EXPIRE (~30 days) because
--                              HaynesPro car-type ids are not stable across
--                              their quarterly database updates.
--   service_time_mappings    — per-service rule for turning HaynesPro data
--                              into a duration: genart-based repair-time
--                              lookup, maintenance schedule time, or none.
--
-- Duration resolution ladder (lib/pricing/calculate.ts):
--   billable(HaynesPro vehicle) → per-(service,area) override → service default
-- where billable(x) = max(1, ceil(x)) — owner decision 2026-07-09: bill in
-- whole hours, always rounding up, minimum 1 hour. Rounding applies ONLY to
-- the HaynesPro-derived value; admin-entered durations are used as-is.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- haynespro_vehicle_cache — service-role only (RLS on, no policies).
-- ---------------------------------------------------------------------------
create table if not exists public.haynespro_vehicle_cache (
  reg                 text primary key,           -- normalised: uppercase, no spaces
  car_type_id         integer not null,           -- HaynesPro ExtCarType.id (NOT stable long-term)
  repairtime_type_id  integer,                    -- may be null when no repair-times coverage
  description         text,                       -- full type name, e.g. "VOLKSWAGEN Golf IV (1J) 1.4"
  hp_make             text,                       -- make (DVLA-sourced, uppercased)
  hp_model_label      text,                       -- make+model portion of the HaynesPro full name,
                                                  -- e.g. "VOLKSWAGEN Golf IV (1J)" — Stage D service
                                                  -- exclusions match on this (names are stable across
                                                  -- HaynesPro DB updates; numeric ids are not)
  resolved_via        text not null default 'details'
                        check (resolved_via in ('vin', 'details')),
  durations           jsonb not null default '{}'::jsonb, -- serviceId → raw hours (unrounded)
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null default now() + interval '30 days'
);

alter table public.haynespro_vehicle_cache enable row level security;
-- No policies: browser clients never touch this table; all reads/writes go
-- through the service-role client in lib/haynespro/.

-- ---------------------------------------------------------------------------
-- service_time_mappings — how each service resolves a vehicle-specific time.
-- Admin-readable (the mapping panel lists it); writes via admin server actions
-- using the service-role client, engine reads via service role.
-- ---------------------------------------------------------------------------
create table if not exists public.service_time_mappings (
  service_id          uuid primary key references public.services(id) on delete cascade,
  strategy            text not null default 'none'
                        check (strategy in ('genart', 'maintenance_max', 'maintenance_min', 'none')),
  genart_ids          integer[] not null default '{}',   -- TecDoc general-article ids
  description_filter  text,                              -- case-insensitive substring on node descriptions
  combine             text not null default 'max'
                        check (combine in ('max', 'min', 'sum')),
  notes               text,
  updated_at          timestamptz not null default now()
);

alter table public.service_time_mappings enable row level security;

drop policy if exists "Admins can view time mappings" on public.service_time_mappings;
create policy "Admins can view time mappings"
  on public.service_time_mappings for select
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- bookings — snapshot which source priced the labour + the raw (unrounded)
-- vehicle duration when HaynesPro supplied it. service_duration_hours (0033)
-- keeps holding the BILLED duration actually charged.
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists duration_source text;
alter table public.bookings
  add column if not exists vehicle_raw_duration_hours numeric(5,2);

-- ---------------------------------------------------------------------------
-- Seed mappings for the 10 catalogue services. Genart ids + filters were
-- verified LIVE against the HaynesPro demo account on 2026-07-09 (VW Golf IV,
-- repairtimeTypeId 8799) — see docs/tasks/16-haynespro-integration.md for the
-- verified raw → billed table. Idempotent: on conflict do nothing, so admin
-- edits are never clobbered by a re-run.
-- ---------------------------------------------------------------------------
insert into public.service_time_mappings (service_id, strategy, genart_ids, description_filter, combine, notes)
select s.id, m.strategy, m.genart_ids, m.description_filter, m.combine, m.notes
from (
  values
    ('front-brake-pads',        'genart',          array[402]::integer[], 'front brake pads',       'max', 'TecDoc 402 = brake pad set. Filter isolates the combined front-axle job (excludes left/right singles). Golf IV: 0.7h.'),
    ('front-brake-discs-pads',  'genart',          array[82]::integer[],  'both front brake discs', 'max', 'TecDoc 82 = brake disc. Pads add negligible time once discs are off. Golf IV: 0.9h.'),
    ('battery-replacement',     'genart',          array[1]::integer[],   'renew the battery',      'max', 'TecDoc 1 = starter battery. Filter excludes cable/tray/holder jobs. Golf IV: 0.2h → bills 1h minimum.'),
    ('clutch-replacement',      'genart',          array[479]::integer[], 'clutch assembly',        'max', 'TecDoc 479 = clutch kit. Max across gearbox variants = safe quote without knowing the gearbox. Golf IV: 3.6–4.8h.'),
    ('cambelt-replacement',     'genart',          array[307]::integer[], 'timing belt kit',        'max', 'TecDoc 307 = timing belt kit. Golf IV: 2.4h.'),
    ('full-service',            'maintenance_max', array[]::integer[],    null,                     'max', 'Largest manufacturer-scheduled service time for the vehicle. Golf IV: 1.6h.'),
    ('interim-service',         'maintenance_min', array[]::integer[],    null,                     'max', 'Smallest manufacturer-scheduled service (oil service). Golf IV: 0.5h.'),
    ('diagnostic',              'none',            array[]::integer[],    null,                     'max', 'Fixed-duration job — uses the service default.'),
    ('mot-precheck',            'none',            array[]::integer[],    null,                     'max', 'Fixed-duration job — uses the service default.'),
    ('air-con-regas',           'none',            array[]::integer[],    null,                     'max', 'Fixed-duration job — uses the service default.')
) as m(slug, strategy, genart_ids, description_filter, combine, notes)
join public.services s on s.slug = m.slug
on conflict (service_id) do nothing;
