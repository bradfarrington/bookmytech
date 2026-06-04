-- 0021_parts.sql
-- Task 10 Stage 2 — parts margin layer.
--
-- Adds three tables:
--   1. `parts`         — the BMT-managed parts catalogue. supplier_cost_pence
--                        and the margin it implies are PLATFORM-ONLY and must
--                        never reach a mechanic, so this table is admin-only
--                        under RLS; booking creation / pricing read it via the
--                        service-role client.
--   2. `service_parts` — which catalogue parts a service requires, and how many.
--                        Configured by admin ("the service knows it needs
--                        parts"); a booking of that service auto-snapshots these
--                        as line items. Admin-only RLS (reads via service-role).
--   3. `booking_parts` — the per-booking line items, snapshotted at creation so
--                        later catalogue/price changes never apply retroactively.
--                        Deliberately stores ONLY the mechanic/customer-safe
--                        figures (bmt unit price + total) — no supplier cost or
--                        margin — so it's safe to expose to the customer and the
--                        assigned mechanic under RLS.
--
-- Money model (owner decision, kept): platform commission is charged on the
-- WHOLE booking total (base + parts). Parts default to self-sourced, which
-- matches the existing payout exactly (mechanic_payout = total − fee already
-- reimburses self-fronted parts). When a mechanic opts to ORDER VIA BMT, that
-- booking's mechanic_payout_pence is reduced by the BMT-sourced parts total (BMT
-- provides the part and keeps that money + the supplier→BMT margin). Existing
-- bookings are untouched.
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. parts — admin-managed catalogue.
-- ---------------------------------------------------------------------------
create table if not exists public.parts (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  sku                 text unique,
  category            text not null,   -- 'brake_pads' | 'battery' | 'oil' | …
  description         text,
  supplier_cost_pence integer not null check (supplier_cost_pence >= 0),
  bmt_price_pence     integer not null check (bmt_price_pence >= 0), -- shown to mechanic/customer
  vehicle_compatibility jsonb,         -- {makes:[…], models:[…], year_from, year_to}
  in_stock            boolean not null default true,
  supplier            text,            -- 'Euro Car Parts' | 'GSF' | …
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists parts_category_idx on public.parts (category);

alter table public.parts enable row level security;

-- Admin-only: supplier cost / margin are platform secrets.
drop policy if exists "Admins manage parts" on public.parts;
create policy "Admins manage parts" on public.parts
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. service_parts — parts a service requires (admin-configured).
-- ---------------------------------------------------------------------------
create table if not exists public.service_parts (
  id         uuid primary key default gen_random_uuid(),
  service_id uuid not null references public.services(id) on delete cascade,
  part_id    uuid not null references public.parts(id) on delete cascade,
  quantity   integer not null default 1 check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (service_id, part_id)
);

create index if not exists service_parts_service_idx on public.service_parts (service_id);

alter table public.service_parts enable row level security;

drop policy if exists "Admins manage service parts" on public.service_parts;
create policy "Admins manage service parts" on public.service_parts
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. booking_parts — per-booking line items (mechanic/customer-safe columns).
-- ---------------------------------------------------------------------------
create table if not exists public.booking_parts (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references public.bookings(id) on delete cascade,
  part_id          uuid references public.parts(id),
  -- Snapshot of the part name so the line renders without a join even if the
  -- catalogue row is later renamed/removed.
  part_name        text not null,
  quantity         integer not null default 1 check (quantity > 0),
  unit_price_pence integer not null check (unit_price_pence >= 0), -- BMT price snapshot
  total_pence      integer not null check (total_pence >= 0),
  -- 'self' = mechanic sources & keeps the money (default, matches existing
  -- payout). 'bmt' = platform sources; payout is reduced by this line.
  sourcing         text not null default 'self' check (sourcing in ('self', 'bmt')),
  status           text not null default 'pending'
                     check (status in ('pending', 'ordered', 'delivered', 'used', 'returned')),
  ordered_at       timestamptz,
  delivered_at     timestamptz,
  created_at       timestamptz not null default now()
);

create index if not exists booking_parts_booking_idx on public.booking_parts (booking_id);

alter table public.booking_parts enable row level security;

-- Customer on the booking reads their line items (mirrors the bookings SELECT
-- shape from 0003).
drop policy if exists "Customers read own booking parts" on public.booking_parts;
create policy "Customers read own booking parts" on public.booking_parts
  for select using (
    exists (
      select 1 from public.bookings b
       where b.id = booking_parts.booking_id
         and (
           b.customer_id = auth.uid()
           or (b.customer_id is null and b.customer_email = auth.email())
         )
    )
  );

-- Assigned mechanic reads (and the sourcing toggle writes go via a server
-- action under service-role, so no mechanic UPDATE policy is needed).
drop policy if exists "Mechanics read assigned booking parts" on public.booking_parts;
create policy "Mechanics read assigned booking parts" on public.booking_parts
  for select using (
    exists (
      select 1 from public.bookings b
       where b.id = booking_parts.booking_id
         and b.mechanic_id = auth.uid()
    )
  );

drop policy if exists "Admins manage booking parts" on public.booking_parts;
create policy "Admins manage booking parts" on public.booking_parts
  for all using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Seed ~40 common parts. Idempotent on sku. Prices in pence; bmt_price carries
-- a realistic margin over supplier_cost.
-- ---------------------------------------------------------------------------
insert into public.parts (name, sku, category, supplier, supplier_cost_pence, bmt_price_pence, description) values
  ('Front Brake Pads — Standard',        'BP-FRONT-STD',  'brake_pads', 'Euro Car Parts', 1800, 3200, 'Front axle brake pad set, OE-equivalent.'),
  ('Rear Brake Pads — Standard',         'BP-REAR-STD',   'brake_pads', 'Euro Car Parts', 1600, 2900, 'Rear axle brake pad set, OE-equivalent.'),
  ('Front Brake Pads — Premium',         'BP-FRONT-PREM', 'brake_pads', 'GSF',            2800, 4800, 'Low-dust ceramic front brake pads.'),
  ('Front Brake Discs (pair)',           'BD-FRONT',      'brake_discs','Euro Car Parts', 3600, 6200, 'Vented front brake discs, sold as a pair.'),
  ('Rear Brake Discs (pair)',            'BD-REAR',       'brake_discs','Euro Car Parts', 3200, 5600, 'Solid rear brake discs, sold as a pair.'),
  ('Brake Fluid DOT 4 (1L)',             'BF-DOT4-1L',    'fluids',     'Comma',          450,  900,  'DOT 4 brake & clutch fluid, 1 litre.'),
  ('12V Battery 060 (54Ah)',             'BAT-060',       'battery',    'Yuasa',          6500, 9900, 'Type 060 lead-acid battery, 54Ah.'),
  ('12V Battery 063 (44Ah)',             'BAT-063',       'battery',    'Yuasa',          5500, 8500, 'Type 063 lead-acid battery, 44Ah.'),
  ('12V Battery 096 AGM (70Ah)',         'BAT-096-AGM',   'battery',    'Varta',          11000,15900, 'Type 096 AGM start-stop battery, 70Ah.'),
  ('Oil Filter — Spin-on',               'OF-SPIN',       'filters',    'Mann',           350,  750,  'Spin-on engine oil filter.'),
  ('Oil Filter — Cartridge',             'OF-CART',       'filters',    'Mann',           420,  850,  'Cartridge engine oil filter element.'),
  ('Air Filter — Panel',                 'AF-PANEL',      'filters',    'Bosch',          600,  1300, 'Panel air filter element.'),
  ('Cabin/Pollen Filter',                'CF-POLLEN',     'filters',    'Bosch',          550,  1200, 'Activated-carbon cabin pollen filter.'),
  ('Fuel Filter — Diesel',               'FF-DIESEL',     'filters',    'Mann',           900,  1800, 'In-line diesel fuel filter.'),
  ('Engine Oil 5W-30 (5L)',              'OIL-5W30-5L',   'oil',        'Castrol',        2200, 3600, 'Fully-synthetic 5W-30 engine oil, 5 litres.'),
  ('Engine Oil 5W-40 (5L)',              'OIL-5W40-5L',   'oil',        'Castrol',        2300, 3800, 'Fully-synthetic 5W-40 engine oil, 5 litres.'),
  ('Engine Oil 0W-20 (5L)',              'OIL-0W20-5L',   'oil',        'Mobil',          2800, 4400, 'Fully-synthetic 0W-20 engine oil, 5 litres.'),
  ('Spark Plug (each)',                  'SP-STD',        'ignition',   'NGK',            300,  650,  'Copper-core spark plug, priced each.'),
  ('Iridium Spark Plug (each)',          'SP-IRID',       'ignition',   'NGK',            700,  1300, 'Long-life iridium spark plug, priced each.'),
  ('Ignition Coil',                      'IC-STD',        'ignition',   'Bosch',          2400, 4200, 'Pencil ignition coil.'),
  ('Wiper Blade — 22"',                  'WB-22',         'wipers',     'Bosch',          600,  1300, 'Aero flat wiper blade, 22 inch.'),
  ('Wiper Blade — 24"',                  'WB-24',         'wipers',     'Bosch',          650,  1400, 'Aero flat wiper blade, 24 inch.'),
  ('Wiper Blade Pair (front)',           'WB-PAIR',       'wipers',     'Bosch',          1100, 2300, 'Matched front wiper blade pair.'),
  ('Auxiliary Drive Belt',               'BELT-AUX',      'belts',      'Gates',          1400, 2600, 'Ribbed auxiliary (serpentine) drive belt.'),
  ('Timing Belt Kit',                    'BELT-TIMING',   'belts',      'Gates',          5200, 8900, 'Timing belt + tensioner kit.'),
  ('Clutch Kit (3-piece)',               'CLUTCH-3PC',    'clutch',     'LuK',            11000,17900, 'Clutch kit: plate, cover, bearing.'),
  ('Front Wheel Bearing',                'WB-FRONT-HUB',  'suspension', 'SKF',            2600, 4500, 'Front wheel bearing/hub assembly.'),
  ('Front Shock Absorber',               'SHOCK-FRONT',   'suspension', 'Monroe',         3400, 5900, 'Front gas shock absorber (each).'),
  ('Front Coil Spring',                  'SPRING-FRONT',  'suspension', 'Monroe',         2200, 3900, 'Front coil spring (each).'),
  ('Lower Suspension Arm',               'ARM-LOWER',     'suspension', 'Delphi',         3000, 5200, 'Front lower control arm with bushes.'),
  ('Track Rod End',                      'TRE-STD',       'steering',   'Delphi',         900,  1900, 'Outer track rod end.'),
  ('Radiator',                           'RAD-STD',       'cooling',    'Nissens',        4800, 7900, 'Aluminium engine radiator.'),
  ('Thermostat',                         'THERMO-STD',    'cooling',    'Gates',          900,  1900, 'Engine coolant thermostat with housing.'),
  ('Water Pump',                         'WP-STD',        'cooling',    'Gates',          2600, 4500, 'Engine coolant water pump.'),
  ('Antifreeze / Coolant (5L)',          'COOL-5L',       'fluids',     'Comma',          1100, 2100, 'Concentrated antifreeze/coolant, 5 litres.'),
  ('Alternator',                         'ALT-STD',       'electrical', 'Bosch',          8500, 13900, 'Remanufactured alternator.'),
  ('Starter Motor',                      'START-STD',     'electrical', 'Bosch',          7800, 12900, 'Remanufactured starter motor.'),
  ('Front Tyre 205/55 R16',              'TYRE-2055516',  'tyres',      'Avon',           4500, 7200, 'Fitted front tyre, 205/55 R16.'),
  ('Front Tyre 225/45 R17',              'TYRE-2254517',  'tyres',      'Avon',           5800, 8900, 'Fitted front tyre, 225/45 R17.'),
  ('Catalytic Converter (universal)',    'CAT-UNI',       'exhaust',    'Klarius',        9500, 15900, 'Type-approved universal catalytic converter.'),
  ('Rear Silencer',                      'EXH-REAR',      'exhaust',    'Klarius',        3800, 6400, 'Rear exhaust silencer box.')
on conflict (sku) do nothing;

-- ---------------------------------------------------------------------------
-- Seed a few service→part mappings so common services arrive "knowing" their
-- parts. Matches the seeded service slugs (0001) to seeded part SKUs. Skipped
-- silently if a service/part isn't present. Idempotent via the unique key.
-- ---------------------------------------------------------------------------
insert into public.service_parts (service_id, part_id, quantity)
select s.id, p.id, m.qty
from (values
  ('full-service', 'OIL-5W30-5L', 1),
  ('full-service', 'OF-SPIN',     1),
  ('full-service', 'AF-PANEL',    1),
  ('full-service', 'CF-POLLEN',   1),
  ('brakes-tyres', 'BP-FRONT-STD',1),
  ('brakes-tyres', 'BD-FRONT',    1),
  ('battery',      'BAT-060',     1)
) as m(service_slug, part_sku, qty)
join public.services s on s.slug = m.service_slug
join public.parts p   on p.sku  = m.part_sku
on conflict (service_id, part_id) do nothing;
