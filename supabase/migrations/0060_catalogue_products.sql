-- 0060_catalogue_products.sql
-- Fixed-price products alongside the HaynesPro repair tree (Task 31, Gareth's
-- change list 2026-09-08): "separate the categories — repairs, diagnostics,
-- servicing, pre-purchase inspection", three diagnostics at £59.99, Bronze /
-- Silver / Gold pre-purchase inspections at set prices, and Interim / Full /
-- Major services priced at an admin-set figure PLUS engine oil at £/litre ×
-- the manufacturer's capacity from HaynesPro.
--
-- This is deliberately NOT the packaged-services catalogue Task 17 removed:
-- HaynesPro stays the source of every repair and every repair time. A
-- product is a thing HaynesPro doesn't price — a diagnostic visit, an
-- inspection, a service — with either a fixed price or admin-set labour
-- hours at the platform rate. Customers see one as a bookable item with id
-- "p:<uuid>" (HaynesPro ids never contain ":"), under one of three category
-- nodes "c:diagnostics" / "c:servicing" / "c:inspection" that sit beside
-- "Repairs" (HaynesPro's root) at the top of the catalogue.
--
-- Read server-side through the service-role client (lib/catalogue/
-- load-products.ts, fail-open to "no products"); written only by admin
-- actions. The admin SELECT policy exists for parity with 0056.
--
-- Idempotent: safe to re-run.

create table if not exists public.catalogue_products (
  id                  uuid primary key default gen_random_uuid(),
  category            text not null check (category in ('diagnostics', 'servicing', 'inspection')),
  name                text not null,
  -- One line under the name in the catalogue ("Find the fault behind a warning light").
  summary             text,
  -- What's included, one item per line; shown on the price page.
  description         text,
  -- A fixed price, OR labour hours at the platform hourly rate. Fixed wins when both are set.
  price_pence         integer check (price_pence is null or price_pence >= 0),
  labour_hours        numeric(4,2) check (labour_hours is null or labour_hours > 0),
  -- How long the visit is blocked out for (arrival-window clash detection, the mechanic's day view).
  duration_hours      numeric(4,2) not null default 1 check (duration_hours > 0),
  -- Servicing: add engine oil at the per-litre setting × the vehicle's capacity.
  includes_engine_oil boolean not null default false,
  display_order       integer not null default 0,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (price_pence is not null or labour_hours is not null)
);
create index if not exists catalogue_products_category_idx
  on public.catalogue_products (category, display_order);
create unique index if not exists catalogue_products_category_name_key
  on public.catalogue_products (category, lower(name));

alter table public.catalogue_products enable row level security;
drop policy if exists "Admins read catalogue products" on public.catalogue_products;
create policy "Admins read catalogue products" on public.catalogue_products
  for select using (public.is_admin());

comment on table public.catalogue_products is
  'Fixed-price / admin-timed products beside the HaynesPro repair tree (Task 31): diagnostics, servicing, inspections. Customers see id p:<uuid>.';

-- A booking line can now be a product as well as a HaynesPro job.
alter table public.booking_repairs
  add column if not exists kind text not null default 'job';
alter table public.booking_repairs
  drop constraint if exists booking_repairs_kind_check;
alter table public.booking_repairs
  add constraint booking_repairs_kind_check check (kind in ('job', 'product'));
comment on column public.booking_repairs.kind is
  'job = a HaynesPro repair (node_id is its id); product = a catalogue product (node_id is p:<uuid>, line_pence its price). 0060.';

-- Engine oil on a servicing booking: the litres and per-litre price it was
-- charged at, and where the litres came from, so the receipt can print
-- "Engine oil · 4.3 L × £15" after the setting changes. The money itself is
-- in bookings.parts_price_pence, which already flows through the payout maths.
alter table public.bookings
  add column if not exists engine_oil_litres numeric(4,1),
  add column if not exists engine_oil_price_per_litre_pence integer,
  add column if not exists engine_oil_source text;
alter table public.bookings
  drop constraint if exists bookings_engine_oil_source_check;
alter table public.bookings
  add constraint bookings_engine_oil_source_check
  check (engine_oil_source is null or engine_oil_source in ('haynespro', 'default'));
comment on column public.bookings.engine_oil_litres is
  'Litres of engine oil charged on a servicing booking (Task 31); null = no oil line.';
comment on column public.bookings.engine_oil_source is
  'haynespro = the manufacturer''s stated capacity; default = the admin fallback litres (no HaynesPro figure).';

-- Settings: the per-litre price and the fallback quantity.
insert into public.platform_settings (key, value)
values ('engine_oil_price_per_litre_pence', '1500'::jsonb), ('engine_oil_default_litres', '5'::jsonb)
on conflict (key) do nothing;

-- Seed. Diagnostics and inspections carry Gareth's prices; the three services
-- ship INACTIVE with placeholder figures until he confirms their prices.
-- Idempotent on (category, name).
insert into public.catalogue_products
  (category, name, summary, description, price_pence, labour_hours, duration_hours, includes_engine_oil, display_order, is_active)
values
  ('diagnostics', 'Diagnostic inspection', 'A mechanic finds the fault behind a warning light, noise or symptom',
   'Visual and hands-on inspection of the reported fault' || chr(10) || 'Written findings and a quote for any repair needed',
   5999, null, 1, false, 0, true),
  ('diagnostics', 'Car won''t start inspection', 'Battery, starter, fuel and ignition checked at your door',
   'Battery and charging test' || chr(10) || 'Starter motor and ignition checks' || chr(10) || 'Fuel delivery checks' || chr(10) || 'Written findings and a quote for any repair needed',
   5999, null, 1, false, 1, true),
  ('diagnostics', 'Plug-in diagnostic', 'Fault codes read from every module with professional diagnostic equipment',
   'Full fault-code scan of the engine, gearbox, ABS, airbag and body modules' || chr(10) || 'Live data checked against the manufacturer''s values' || chr(10) || 'Written findings and a quote for any repair needed',
   5999, null, 1, false, 2, true),
  ('inspection', 'Bronze pre-purchase inspection', '64-point check of the essentials before you buy',
   'Interior, safety and convenience systems' || chr(10) || 'Road test and final checks' || chr(10) || 'Engine bay, wheels, tyres and body condition' || chr(10) || 'Written report with photos',
   7299, null, 1, false, 0, true),
  ('inspection', 'Silver pre-purchase inspection', '116-point check including brakes, steering, suspension and a battery test',
   'Everything in Bronze' || chr(10) || 'Brakes, steering and suspension' || chr(10) || 'Battery, alternator and starter tests' || chr(10) || 'Bodywork repair and paint checks' || chr(10) || 'Written report with photos',
   9299, null, 1.5, false, 1, true),
  ('inspection', 'Gold pre-purchase inspection', '173-point check with full diagnostic scans and underbody, driveline and fuel-system inspection',
   'Everything in Silver' || chr(10) || 'Engine, gearbox, ABS, airbag and body module scans' || chr(10) || 'Transmission, driveline, exhaust and underbody' || chr(10) || 'Fuel system and brake hydraulics' || chr(10) || 'Written report with photos',
   13999, null, 2, false, 2, true),
  ('servicing', 'Interim service', '46-point check with an oil and filter change — every six months or 6,000 miles',
   'Engine oil and oil filter replaced' || chr(10) || 'Fluids checked and topped up' || chr(10) || '46-point inspection with a stamped service book',
   9900, null, 1.5, true, 0, false),
  ('servicing', 'Full service', '56-point check with oil, oil filter and air filter — every year or 12,000 miles',
   'Engine oil, oil filter and air filter replaced' || chr(10) || 'Fluids checked and topped up' || chr(10) || '56-point inspection with a stamped service book',
   14900, null, 2.5, true, 1, false),
  ('servicing', 'Major service', '66-point check with oil, all filters and spark plugs — every two years or 24,000 miles',
   'Engine oil, oil filter, air filter and pollen filter replaced' || chr(10) || 'Spark plugs replaced (petrol)' || chr(10) || 'Fluids checked and topped up' || chr(10) || '66-point inspection with a stamped service book',
   19900, null, 3, true, 2, false)
on conflict (category, lower(name)) do nothing;
