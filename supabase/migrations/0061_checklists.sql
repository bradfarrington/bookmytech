-- 0061_checklists.sql
-- Service checklists and pre-purchase inspection reports (Task 32, Gareth's
-- change list 2026-09-08): "I will supply a checklist for each service — a
-- checkbox with checked and n/a and a box so mechanics can leave comments
-- about each thing that was checked", and a drop-down per item on the
-- pre-purchase inspection (his sheet grades Pass / Advisory / Fail / Not
-- Checked; Bronze / Silver / Gold each cover a subset of the items).
--
-- Three tables:
--   checklists                — one per document: the three service lists and
--                               the inspection; `kind` decides the answer scale.
--   checklist_items           — the lines, in sections, in order; `tiers` is
--                               null (every tier) or the subset of
--                               {bronze, silver, gold} the item applies to.
--                               Soft-removed with is_active so old reports
--                               keep their items.
--   booking_checklist_results — one row per (booking, item): the answer and
--                               the mechanic's comment.
-- A product (0060) links to its checklist with checklist_id + checklist_tier;
-- a booking's checklists are those of the products it contains.
--
-- RLS: checklists + items are catalogue data (no PII) — readable by any
-- signed-in user, admins manage. Results are readable by the booking's
-- customer (the report IS the product on an inspection), the assigned
-- mechanic and admins; written only through the service-role client by the
-- mechanic's action (mechanics have no write policies anywhere, as usual).
--
-- The seed below was GENERATED from Gareth's four documents (docs/checklists/)
-- and matches his counts: Interim 46, Full 56, Major 66; the inspection has
-- 173 items in 10 sections — Bronze 64, Silver 116, Gold 173.
--
-- Idempotent: safe to re-run.

create table if not exists public.checklists (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  name       text not null,
  kind       text not null check (kind in ('service', 'inspection')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.checklist_items (
  id           uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists (id) on delete cascade,
  section      text not null default 'Checks',
  label        text not null,
  position     integer not null default 0,
  tiers        text[],
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (checklist_id, section, label),
  check (tiers is null or tiers <@ array['bronze', 'silver', 'gold']::text[])
);
create index if not exists checklist_items_checklist_idx
  on public.checklist_items (checklist_id, position);

create table if not exists public.booking_checklist_results (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  item_id    uuid not null references public.checklist_items (id),
  result     text not null check (result in ('checked', 'na', 'pass', 'advisory', 'fail', 'not_checked')),
  comment    text,
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, item_id)
);
create index if not exists booking_checklist_results_booking_idx
  on public.booking_checklist_results (booking_id);

alter table public.catalogue_products
  add column if not exists checklist_id uuid references public.checklists (id) on delete set null,
  add column if not exists checklist_tier text;
alter table public.catalogue_products
  drop constraint if exists catalogue_products_checklist_tier_check;
alter table public.catalogue_products
  add constraint catalogue_products_checklist_tier_check
  check (checklist_tier is null or checklist_tier in ('bronze', 'silver', 'gold'));

-- RLS ------------------------------------------------------------------------
alter table public.checklists                enable row level security;
alter table public.checklist_items           enable row level security;
alter table public.booking_checklist_results enable row level security;

drop policy if exists "Signed-in users read checklists" on public.checklists;
create policy "Signed-in users read checklists" on public.checklists
  for select to authenticated using (true);
drop policy if exists "Signed-in users read checklist items" on public.checklist_items;
create policy "Signed-in users read checklist items" on public.checklist_items
  for select to authenticated using (true);

-- Results: the booking's customer (signed in, or a guest matched on email),
-- mirroring "Customers read own booking repairs" (0055).
drop policy if exists "Customers read own checklist results" on public.booking_checklist_results;
create policy "Customers read own checklist results" on public.booking_checklist_results
  for select using (
    exists (
      select 1 from public.bookings b
       where b.id = booking_checklist_results.booking_id
         and (
           b.customer_id = auth.uid()
           or (b.customer_id is null and b.customer_email = auth.email())
         )
    )
  );
drop policy if exists "Mechanics read assigned checklist results" on public.booking_checklist_results;
create policy "Mechanics read assigned checklist results" on public.booking_checklist_results
  for select using (
    exists (
      select 1 from public.bookings b
       where b.id = booking_checklist_results.booking_id
         and b.mechanic_id = auth.uid()
    )
  );
drop policy if exists "Admins read all checklist results" on public.booking_checklist_results;
create policy "Admins read all checklist results" on public.booking_checklist_results
  for select using (public.is_admin());

comment on table public.checklists is
  'Service checklists and the pre-purchase inspection (Task 32); kind decides the answer scale.';
comment on table public.checklist_items is
  'The lines of a checklist, in sections; tiers null = every tier, else the Bronze/Silver/Gold subset it applies to.';
comment on table public.booking_checklist_results is
  'The mechanic''s answer + comment per (booking, item). checked/na on a service; pass/advisory/fail/not_checked on an inspection.';

-- Seed (generated) -----------------------------------------------------------
insert into public.checklists (key, name, kind) values
  ('interim_service', 'Interim service checklist', 'service'),
  ('full_service', 'Full service checklist', 'service'),
  ('major_service', 'Major service checklist', 'service'),
  ('pre_purchase_inspection', 'Pre-purchase inspection', 'inspection')
on conflict (key) do nothing;

-- interim_service: 46 items
insert into public.checklist_items (checklist_id, section, label, position, tiers)
select c.id, 'Checks', v.label, v.position, null from public.checklists c,
  (values
    ('Change Oil', 0),
    ('Replace engine oil and oil filter', 1),
    ('Check and top up engine coolant', 2),
    ('Inspect brake fluid level', 3),
    ('Check power steering fluid', 4),
    ('Top up windscreen washer fluid', 5),
    ('Battery Check', 6),
    ('Inspect battery terminals for corrosion', 7),
    ('Brakes Inspection', 8),
    ('Inspect brake pads and discs for wear', 9),
    ('Check brake fluid quality', 10),
    ('Tyres and Wheels', 11),
    ('Check tyre condition and tread depth', 12),
    ('Look for uneven tyre wear', 13),
    ('Lights Functionality', 14),
    ('Check all exterior lights (headlights, brake lights, indicator lights)', 15),
    ('Inspect interior lights for functionality', 16),
    ('Wiper Blades', 17),
    ('Inspect wiper blades for deterioration; replace if needed', 18),
    ('Test windscreen washer operation', 19),
    ('Exhaust System', 20),
    ('Check for any visible signs of damage or leaks', 21),
    ('Cooling System', 22),
    ('Inspect radiator and hoses for wear and leaks', 23),
    ('Inspect drive belts for cracks or wear', 24),
    ('Check for fluid condition and levels', 25),
    ('Inspect and replace cabin filter as needed', 26),
    ('Check seat belts for functionality', 27),
    ('Visual check of all under-bonnet components for leaks or damage', 28),
    ('Inspect hoses for wear, cracking, or leaks', 29),
    ('Visual inspection of shocks and struts', 30),
    ('Braking System Check', 31),
    ('Ensure ABS system is functioning', 32),
    ('Confirm fuel lines are secure and free from leaks', 33),
    ('Check for obvious rust or damage', 34),
    ('Fluid Leak Check', 35),
    ('Inspect for any leaks under the vehicle', 36),
    ('Lubricate the battery terminals', 37),
    ('Lubricate necessary pivot points', 38),
    ('Emergency Kit Check', 39),
    ('Ensure that the spare tyre and emergency tools are present and in working order', 40),
    ('Inspection of Dashboard Lights', 41),
    ('Check for any warning lights on the dashboard', 42),
    ('Ensure steering Wheel and Gear Lever are Clean', 43),
    ('Reset Service Interval light', 44),
    ('Stamp Service Book', 45)
  ) as v(label, position)
where c.key = 'interim_service'
on conflict (checklist_id, section, label) do nothing;

-- full_service: 56 items
insert into public.checklist_items (checklist_id, section, label, position, tiers)
select c.id, 'Checks', v.label, v.position, null from public.checklists c,
  (values
    ('Replace engine oil', 0),
    ('Replace oil filter', 1),
    ('Replace Air Filter', 2),
    ('Check and top up coolant', 3),
    ('Check power steering fluid', 4),
    ('Top up Power Steering Fluid', 5),
    ('Top up windscreen washer fluid', 6),
    ('Battery Check', 7),
    ('Inspect battery terminals for corrosion and clean', 8),
    ('Inspect brake pads and discs for wear', 9),
    ('Check brake lines for leaks', 10),
    ('Inspect and brake fluid', 11),
    ('Top up Brake Fluid', 12),
    ('Check tyre condition', 13),
    ('Check tread depth', 14),
    ('Check Tyre pressures', 15),
    ('Inspect for uneven wear', 16),
    ('Check wheel lug nut torque', 17),
    ('Check operation of side lights', 18),
    ('Check operation of headlights', 19),
    ('Check operation of directional indicators', 20),
    ('Check operation of fog lights (Front and Rear)', 21),
    ('Check operation of Brake lights', 22),
    ('Check operation of Reverse lights', 23),
    ('Inspect interior lights for functionality', 24),
    ('Inspect wiper blades for deterioration', 25),
    ('Test windscreen washer operation', 26),
    ('Inspect for signs of damage, rust, or leaks', 27),
    ('Check radiator and hoses for wear and leaks', 28),
    ('Inspect thermostat operation', 29),
    ('Inspect serpentine belt for Wear', 30),
    ('Check Transmission fluid levels and condition', 31),
    ('Check seat belts for functionality and condition', 32),
    ('Inspect interior for cleanliness and any damage', 33),
    ('Inspect shock absorbers and struts for wear', 34),
    ('Examine suspension bushings and joints', 35),
    ('Check Coil Springs (front)', 36),
    ('Check Coil Springs (rear)', 37),
    ('Inspect fuel lines for leaks', 38),
    ('Check fuel filter condition', 39),
    ('Inspect undercarriage for rust or damage', 40),
    ('Check for any oil leaks', 41),
    ('Check all hoses for cracking or leaks', 42),
    ('Inspect wheel bearings', 43),
    ('Inspect driveshaft and U-joints for wear', 44),
    ('Check Differential levels and condition', 45),
    ('Inspect bodywork for dents, scratches, or rust', 46),
    ('Inspect for any leaks under the vehicle', 47),
    ('Check timing belt interval', 48),
    ('Check Throttle Body and Intake System', 49),
    ('Lubricate necessary pivot points and joints', 50),
    ('Check spare tyre and emergency kit contents', 51),
    ('Recheck Oil Level', 52),
    ('Ensure steering Wheel and Gear Lever are Clean', 53),
    ('Reset Service Interval light', 54),
    ('Stamp Service Book', 55)
  ) as v(label, position)
where c.key = 'full_service'
on conflict (checklist_id, section, label) do nothing;

-- major_service: 66 items
insert into public.checklist_items (checklist_id, section, label, position, tiers)
select c.id, 'Checks', v.label, v.position, null from public.checklists c,
  (values
    ('Replace engine oil', 0),
    ('Replace oil filter', 1),
    ('Replace Air Filter', 2),
    ('Replace Pollen Filter', 3),
    ('Replace Spark Plugs (petrol Only)', 4),
    ('Check and top up coolant', 5),
    ('Check power steering fluid', 6),
    ('Top up Power Steering Fluid', 7),
    ('Top up windscreen washer fluid', 8),
    ('Battery Check', 9),
    ('Inspect battery terminals for corrosion and clean', 10),
    ('Inspect brake pads and discs for wear', 11),
    ('Check brake lines for leaks', 12),
    ('Check Servo Operation', 13),
    ('Check Brake Pedal For Sponginess', 14),
    ('Inspect brake fluid', 15),
    ('Top up Brake Fluid', 16),
    ('Check tyre condition', 17),
    ('Check tread depth', 18),
    ('Check Tyre pressures', 19),
    ('Inspect for uneven wear', 20),
    ('Check wheel lug nut torque', 21),
    ('Check Alloy Condition', 22),
    ('Check operation of side lights', 23),
    ('Check operation of Headlights', 24),
    ('Check operation of directional indicators', 25),
    ('Check operation of fog lights (Front and Rear)', 26),
    ('Check operation of Brake lights', 27),
    ('Check operation of Reverse lights', 28),
    ('Inspect interior lights for functionality', 29),
    ('Inspect wiper blades for deterioration', 30),
    ('Test windscreen washer operation', 31),
    ('Inspect for signs of damage, rust, or leaks', 32),
    ('Check radiator and hoses for wear and leaks', 33),
    ('Inspect thermostat operation', 34),
    ('Inspect serpentine belt for Wear', 35),
    ('Check Transmission fluid levels and condition', 36),
    ('Check seat belts for functionality and condition', 37),
    ('Check operation of Driver Seat', 38),
    ('Check Interior Mirror Condition', 39),
    ('Check Windows Operate Correctly', 40),
    ('Check Doors open From Inside/Outside', 41),
    ('Check boot Operation', 42),
    ('Inspect interior for cleanliness and any damage', 43),
    ('Inspect shock absorbers and struts for wear', 44),
    ('Examine suspension bushings and joints', 45),
    ('Check Coil Springs (front)', 46),
    ('Check Coil Springs (rear)', 47),
    ('Inspect fuel lines for leaks', 48),
    ('Check fuel filter condition', 49),
    ('Inspect undercarriage for rust or damage', 50),
    ('Check for any oil leaks', 51),
    ('Check all hoses for cracking or leaks', 52),
    ('Inspect wheel bearings', 53),
    ('Inspect driveshaft and U-joints for wear', 54),
    ('Check Differential levels and condition', 55),
    ('Inspect bodywork for dents, scratches, or rust', 56),
    ('Inspect for any leaks under the vehicle', 57),
    ('Check timing belt interval', 58),
    ('Check Throttle Body and Intake System', 59),
    ('Lubricate necessary pivot points and joints', 60),
    ('Check spare tyre and emergency kit contents', 61),
    ('Recheck Oil Level', 62),
    ('Ensure steering Wheel and Gear Lever are Clean', 63),
    ('Reset Service Interval light', 64),
    ('Stamp Service Book', 65)
  ) as v(label, position)
where c.key = 'major_service'
on conflict (checklist_id, section, label) do nothing;

-- pre_purchase_inspection: 173 items in 10 sections (bronze 64, silver 116, gold 173)
insert into public.checklist_items (checklist_id, section, label, position, tiers)
select c.id, v.section, v.label, v.position, v.tiers from public.checklists c,
  (values
    ('Interior, Safety, and Convenience Systems', 'Central locking', 0, array['bronze','silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Driver''s seat condition and adjustment', 1, array['bronze','silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Front passenger seat condition and adjustment', 2, array['bronze','silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Rear seats and folding mechanisms', 3, array['bronze','silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Seat belts, buckles, and mountings', 4, array['bronze','silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Head restraints and child-seat anchor points', 5, array['bronze','silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Carpets, boot floor, dampness, and water ingress', 6, array['bronze','silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Seat upholstery', 7, array['bronze','silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Headlining, dashboard, and interior trim', 8, array['bronze','silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Instrument display and gauges', 9, array['bronze','silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Rear view mirror condition', 10, array['bronze','silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Warning-light self-test', 11, array['bronze','silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Airbag warning status', 12, array['bronze','silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Visors', 13, array['bronze','silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Electric windows', 14, array['bronze','silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Central locking and child locks', 15, array['bronze','silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Electric mirror adjustment and heating', 16, array['bronze','silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Heating and ventilation controls', 17, array['bronze','silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Air-conditioning operation', 18, array['bronze','silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Charging ports (usb/cigarette lighter)', 19, array['silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Seat belts', 20, array['bronze','silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Heated or ventilated seats, where fitted', 21, array['silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Infotainment display and controls', 22, array['silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Radio, speakers, Bluetooth, and navigation', 23, array['silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Horn', 24, array['silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Interior and luggage-compartment lights', 25, array['silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Parking sensors and reversing camera', 26, array['silver','gold']::text[]),
    ('Interior, Safety, and Convenience Systems', 'Sunroof, convertible roof, or powered tailgate', 27, array['silver','gold']::text[]),
    ('Diagnostics and Electrical System', 'Engine control-module scan', 28, array['gold']::text[]),
    ('Diagnostics and Electrical System', 'Transmission control-module scan', 29, array['gold']::text[]),
    ('Diagnostics and Electrical System', 'ABS and stability-control scan', 30, array['gold']::text[]),
    ('Diagnostics and Electrical System', 'Airbag and restraint-system scan', 31, array['gold']::text[]),
    ('Diagnostics and Electrical System', 'Body and comfort-module scan', 32, array['gold']::text[]),
    ('Diagnostics and Electrical System', 'Current, pending, and stored fault codes recorded', 33, array['gold']::text[]),
    ('Diagnostics and Electrical System', 'Battery condition or test result', 34, array['silver','gold']::text[]),
    ('Diagnostics and Electrical System', 'Alternator charging output', 35, array['silver','gold']::text[]),
    ('Diagnostics and Electrical System', 'Starter-motor operation', 36, array['silver','gold']::text[]),
    ('Road Test and Final Checks', 'Driving test (up to 5 miles)', 37, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'Engine performance and throttle response', 38, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'Clutch, gearbox, and transmission under load', 39, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'Steering response, self-centring, and tracking', 40, array['silver','gold']::text[]),
    ('Road Test and Final Checks', 'Service-brake performance and straight-line braking', 41, array['silver','gold']::text[]),
    ('Road Test and Final Checks', 'Parking-brake holding ability', 42, array['silver','gold']::text[]),
    ('Road Test and Final Checks', 'Suspension behaviour and abnormal noises', 43, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'Wheel-bearing, tyre, wind, and driveline noise', 44, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'Vibration through steering wheel, pedals, or body', 45, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'Temperature, warning lights, and driver-assistance systems during test', 46, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'Warm restart and post-road-test leak inspection', 47, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'Bonnet gas struts or support stay', 48, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'Boot or tailgate struts', 49, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'Door check straps and weather seals', 50, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'Windscreen scuttle and drainage channels', 51, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'Washer-fluid level and reservoir condition', 52, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'Brake-fluid moisture or test result', 53, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'Coolant antifreeze strength or test result', 54, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'Air-filter condition, where accessible', 55, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'Cabin-filter condition, where accessible', 56, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'Engine breather hoses and intake pipework', 57, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'Turbocharger hoses and visible connections, where fitted', 58, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'Diesel particulate-filter warning status, where fitted', 59, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'AdBlue level and warning status, where fitted', 60, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'Emissions warning status after the road test', 61, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'Final photographic record of defects and vehicle condition', 62, array['bronze','silver','gold']::text[]),
    ('Road Test and Final Checks', 'Hot restarting', 63, array['silver','gold']::text[]),
    ('Road Test and Final Checks', 'Cooling fan operation', 64, array['silver','gold']::text[]),
    ('Road Test and Final Checks', 'Stop-start system', 65, array['silver','gold']::text[]),
    ('Road Test and Final Checks', 'Hill start system', 66, array['silver','gold']::text[]),
    ('Engine Compartment and Cooling System', 'Bonnet catch Engine was cold before initial start', 67, array['bronze','silver','gold']::text[]),
    ('Engine Compartment and Cooling System', 'Engine starts correctly from cold', 68, array['bronze','silver','gold']::text[]),
    ('Engine Compartment and Cooling System', 'Idle quality when cold', 69, array['bronze','silver','gold']::text[]),
    ('Engine Compartment and Cooling System', 'Idle quality when warm', 70, array['silver','gold']::text[]),
    ('Engine Compartment and Cooling System', 'Abnormal engine noise', 71, array['silver','gold']::text[]),
    ('Engine Compartment and Cooling System', 'Exhaust smoke on startup', 72, array['silver','gold']::text[]),
    ('Engine Compartment and Cooling System', 'Exhaust smoke when warm or under acceleration', 73, array['silver','gold']::text[]),
    ('Engine Compartment and Cooling System', 'Engine-oil level', 74, array['silver','gold']::text[]),
    ('Engine Compartment and Cooling System', 'Engine-oil condition', 75, array['silver','gold']::text[]),
    ('Engine Compartment and Cooling System', 'Oil filler cap and visible sludge or contamination', 76, array['gold']::text[]),
    ('Engine Compartment and Cooling System', 'External engine-oil leakage', 77, array['silver','gold']::text[]),
    ('Engine Compartment and Cooling System', 'Coolant level', 78, array['silver','gold']::text[]),
    ('Engine Compartment and Cooling System', 'Coolant condition and contamination', 79, array['silver','gold']::text[]),
    ('Engine Compartment and Cooling System', 'Visible coolant leakage', 80, array['silver','gold']::text[]),
    ('Engine Compartment and Cooling System', 'Radiator and cooling fan', 81, array['gold']::text[]),
    ('Engine Compartment and Cooling System', 'Expansion tank and pressure cap', 82, array['silver','gold']::text[]),
    ('Engine Compartment and Cooling System', 'Cooling hoses and connections', 83, array['gold']::text[]),
    ('Engine Compartment and Cooling System', 'Operating temperature and overheating evidence', 84, array['gold']::text[]),
    ('Engine Compartment and Cooling System', 'Auxiliary drive belts and tensioners', 85, array['gold']::text[]),
    ('Engine Compartment and Cooling System', 'Timing-belt history or visible condition, where applicable', 86, array['gold']::text[]),
    ('Engine Compartment and Cooling System', 'Battery security and terminal condition', 87, array['bronze','silver','gold']::text[]),
    ('Engine Compartment and Cooling System', 'Engine-bay wiring and connectors', 88, array['bronze','silver','gold']::text[]),
    ('Engine Compartment and Cooling System', 'Engine and gearbox mountings', 89, array['bronze','silver','gold']::text[]),
    ('Engine Compartment and Cooling System', 'Fuel-system leaks or odour', 90, array['bronze','silver','gold']::text[]),
    ('Engine Compartment and Cooling System', 'Engine covers, under-bonnet insulation, and evidence of poor repair', 91, array['bronze','silver','gold']::text[]),
    ('Wheels & tyres', 'Nearside Front tyre', 92, array['bronze','silver','gold']::text[]),
    ('Wheels & tyres', 'Offside Front tyre', 93, array['bronze','silver','gold']::text[]),
    ('Wheels & tyres', 'Nearside Rear tyre', 94, array['bronze','silver','gold']::text[]),
    ('Wheels & tyres', 'Offside Rear tyre', 95, array['bronze','silver','gold']::text[]),
    ('Wheels & tyres', 'Uneven tyre wear', 96, array['bronze','silver','gold']::text[]),
    ('Wheels & tyres', 'Spare wheel or repair kit, jack, and wheel tools', 97, array['bronze','silver','gold']::text[]),
    ('Wheels & tyres', 'Locking wheel nut key', 98, array['bronze','silver','gold']::text[]),
    ('Wheels & tyres', 'Wheel rims/Trims', 99, array['bronze','silver','gold']::text[]),
    ('Wheels & tyres', 'Alloy wheel condition (if applicable)', 100, array['silver','gold']::text[]),
    ('Body Structure and Exterior', 'Overall body condition', 101, array['bronze','silver','gold']::text[]),
    ('Body Structure and Exterior', 'Front bumper', 102, array['bronze','silver','gold']::text[]),
    ('Body Structure and Exterior', 'Grille and front trim', 103, array['bronze','silver','gold']::text[]),
    ('Body Structure and Exterior', 'Bonnet operation, latch, and hinges', 104, array['bronze','silver','gold']::text[]),
    ('Body Structure and Exterior', 'Boot lid or tailgate (Operation)', 105, array['bronze','silver','gold']::text[]),
    ('Body Structure and Exterior', 'Rear bumper', 106, array['silver','gold']::text[]),
    ('Body Structure and Exterior', 'Nearside sill and jacking points', 107, array['silver','gold']::text[]),
    ('Body Structure and Exterior', 'Offside sill and jacking points', 108, array['silver','gold']::text[]),
    ('Body Structure and Exterior', 'Panel gaps and alignment', 109, array['silver','gold']::text[]),
    ('Body Structure and Exterior', 'Paint colour and finish consistency', 110, array['silver','gold']::text[]),
    ('Body Structure and Exterior', 'Overspray or refinishing evidence', 111, array['silver','gold']::text[]),
    ('Body Structure and Exterior', 'Evidence of filler or previous body repair', 112, array['silver','gold']::text[]),
    ('Body Structure and Exterior', 'Visible structural repair or distortion', 113, array['gold']::text[]),
    ('Body Structure and Exterior', 'Exterior corrosion', 114, array['gold']::text[]),
    ('Body Structure and Exterior', 'Dents, scratches, and stone chips', 115, array['gold']::text[]),
    ('Body Structure and Exterior', 'Door handles, hinges, catches, and locks', 116, array['gold']::text[]),
    ('Body Structure and Exterior', 'Fuel-filler flap and cap', 117, array['gold']::text[]),
    ('Body Structure and Exterior', 'Exterior badges, mouldings, and trim', 118, array['gold']::text[]),
    ('Body Structure and Exterior', 'Convertible roof or sunroof exterior condition', 119, array['gold']::text[]),
    ('Body Structure and Exterior', 'Water ingress around body seals', 120, array['gold']::text[]),
    ('Brakes, Steering, and Suspension', 'Front brake-disc condition', 121, array['silver','gold']::text[]),
    ('Brakes, Steering, and Suspension', 'Front brake-pad condition', 122, array['silver','gold']::text[]),
    ('Brakes, Steering, and Suspension', 'Rear brake-disc or drum condition', 123, array['silver','gold']::text[]),
    ('Brakes, Steering, and Suspension', 'Rear brake-pad or shoe condition', 124, array['silver','gold']::text[]),
    ('Brakes, Steering, and Suspension', 'Visible brake hoses and pipes', 125, array['silver','gold']::text[]),
    ('Brakes, Steering, and Suspension', 'Brake-fluid level and condition', 126, array['silver','gold']::text[]),
    ('Brakes, Steering, and Suspension', 'Brake pedal feel and operation', 127, array['silver','gold']::text[]),
    ('Brakes, Steering, and Suspension', 'Parking-brake operation', 128, array['gold']::text[]),
    ('Brakes, Steering, and Suspension', 'ABS and stability-control warning status', 129, array['gold']::text[]),
    ('Brakes, Steering, and Suspension', 'Steering-wheel condition and free play', 130, array['gold']::text[]),
    ('Brakes, Steering, and Suspension', 'Power-steering operation', 131, array['gold']::text[]),
    ('Brakes, Steering, and Suspension', 'Steering rack and visible gaiters', 132, array['gold']::text[]),
    ('Brakes, Steering, and Suspension', 'Steering joints and track-rod ends', 133, array['silver','gold']::text[]),
    ('Brakes, Steering, and Suspension', 'Front springs and shock absorbers', 134, array['silver','gold']::text[]),
    ('Brakes, Steering, and Suspension', 'Rear springs and shock absorbers', 135, array['silver','gold']::text[]),
    ('Brakes, Steering, and Suspension', 'Front suspension arms and bushes', 136, array['silver','gold']::text[]),
    ('Brakes, Steering, and Suspension', 'Rear suspension arms and bushes', 137, array['silver','gold']::text[]),
    ('Brakes, Steering, and Suspension', 'Ball joints and suspension mountings', 138, array['silver','gold']::text[]),
    ('Brakes, Steering, and Suspension', 'Wheel-bearing condition', 139, array['silver','gold']::text[]),
    ('Brakes, Steering, and Suspension', 'Ride height, alignment, and uneven stance', 140, array['silver','gold']::text[]),
    ('Brake hydraulics', 'Master cylinder security (if accessible)', 141, array['gold']::text[]),
    ('Brake hydraulics', 'Fluid leaks', 142, array['gold']::text[]),
    ('Brake hydraulics', 'Servo/power system', 143, array['gold']::text[]),
    ('Brake hydraulics', 'Flexible hoses', 144, array['gold']::text[]),
    ('Brake hydraulics', 'Pipes/connections', 145, array['gold']::text[]),
    ('Transmission, Driveline, Exhaust, and Underbody', 'Clutch pedal operation', 146, array['gold']::text[]),
    ('Transmission, Driveline, Exhaust, and Underbody', 'Manual gear selection, where applicable', 147, array['gold']::text[]),
    ('Transmission, Driveline, Exhaust, and Underbody', 'Clutch bite, slip, and judder', 148, array['gold']::text[]),
    ('Transmission, Driveline, Exhaust, and Underbody', 'Automatic selector operation, where applicable', 149, array['gold']::text[]),
    ('Transmission, Driveline, Exhaust, and Underbody', 'Automatic transmission shift quality', 150, array['gold']::text[]),
    ('Transmission, Driveline, Exhaust, and Underbody', 'Transmission-fluid leakage', 151, array['gold']::text[]),
    ('Transmission, Driveline, Exhaust, and Underbody', 'Driveshafts', 152, array['gold']::text[]),
    ('Transmission, Driveline, Exhaust, and Underbody', 'CV joints and gaiters', 153, array['gold']::text[]),
    ('Transmission, Driveline, Exhaust, and Underbody', 'Differential condition and leakage', 154, array['gold']::text[]),
    ('Transmission, Driveline, Exhaust, and Underbody', 'Prop shaft and centre bearing, where fitted', 155, array['gold']::text[]),
    ('Transmission, Driveline, Exhaust, and Underbody', 'Four-wheel-drive system, where fitted', 156, array['gold']::text[]),
    ('Transmission, Driveline, Exhaust, and Underbody', 'Driveline vibration or noise', 157, array['gold']::text[]),
    ('Transmission, Driveline, Exhaust, and Underbody', 'Exhaust manifold and front pipe', 158, array['gold']::text[]),
    ('Transmission, Driveline, Exhaust, and Underbody', 'Catalytic converter and emissions components', 159, array['gold']::text[]),
    ('Transmission, Driveline, Exhaust, and Underbody', 'Exhaust centre and rear sections', 160, array['gold']::text[]),
    ('Transmission, Driveline, Exhaust, and Underbody', 'Exhaust mountings, leaks, and noise', 161, array['gold']::text[]),
    ('Transmission, Driveline, Exhaust, and Underbody', 'Underbody structural corrosion', 162, array['gold']::text[]),
    ('Transmission, Driveline, Exhaust, and Underbody', 'Underbody impact or grounding damage', 163, array['gold']::text[]),
    ('Transmission, Driveline, Exhaust, and Underbody', 'Floor pan, subframes, and jacking points', 164, array['gold']::text[]),
    ('Transmission, Driveline, Exhaust, and Underbody', 'Fuel lines, brake lines, undertrays, and heat shields', 165, array['gold']::text[]),
    ('Fuel system', 'Tank fixings', 166, array['gold']::text[]),
    ('Fuel system', 'Fuel lines', 167, array['gold']::text[]),
    ('Fuel system', 'Breather pipes', 168, array['gold']::text[]),
    ('Fuel system', 'Evidence of leaks', 169, array['gold']::text[]),
    ('Fuel system', 'Fuel tank (if accessible)', 170, array['gold']::text[]),
    ('Fuel system', 'Heat shields condition', 171, array['gold']::text[]),
    ('Fuel system', 'DPF Condition (soot content with plug-in)', 172, array['gold']::text[])
  ) as v(section, label, position, tiers)
where c.key = 'pre_purchase_inspection'
on conflict (checklist_id, section, label) do nothing;

-- Link the seeded products (0060) to their checklists.
update public.catalogue_products p
   set checklist_id = c.id
  from public.checklists c
 where p.checklist_id is null
   and ((c.key = 'interim_service' and lower(p.name) = 'interim service')
     or (c.key = 'full_service' and lower(p.name) = 'full service')
     or (c.key = 'major_service' and lower(p.name) = 'major service'));
update public.catalogue_products p
   set checklist_id = c.id,
       checklist_tier = case
         when lower(p.name) like 'bronze%' then 'bronze'
         when lower(p.name) like 'silver%' then 'silver'
         when lower(p.name) like 'gold%' then 'gold'
       end
  from public.checklists c
 where p.checklist_id is null
   and c.key = 'pre_purchase_inspection'
   and p.category = 'inspection'
   and (lower(p.name) like 'bronze%' or lower(p.name) like 'silver%' or lower(p.name) like 'gold%');
