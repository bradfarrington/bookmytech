-- Task 02 Stage 3 — seed the services catalogue so the landing page's
-- services-preview has real data to render and the admin /admin/services
-- list isn't empty on first load.
--
-- Idempotent: `on conflict (slug) do nothing` means re-running this migration
-- against a populated table is a no-op. To intentionally overwrite a row,
-- delete it first via the admin UI (sets is_active=false; doesn't actually
-- delete) or via SQL.
--
-- Slugs are aligned with the SERVICE_META map in
-- `app/(customer)/_components/services-preview.tsx` so the top 6 by
-- display_order render with proper icons on the landing page.

insert into services (name, slug, category, description, starting_price_pence, display_order, is_active)
values
  ('Full Service',             'full-service',             'service',   'Comprehensive service covering oil, filters, brakes inspection, fluid top-ups and a 50-point check.',     18900, 1, true),
  ('Diagnostic',               'diagnostic',               'diagnostic','OBD-II diagnostic scan plus a road test and written report on any faults found.',                          4500, 2, true),
  ('Front Brake Pads',         'front-brake-pads',         'brakes',    'Replacement of front brake pads (standard quality). Includes inspection of discs and calipers.',          13900, 3, true),
  ('Battery Replacement',      'battery-replacement',      'battery',   'Supply and fit a new 12V battery sized for your vehicle. Includes safe disposal of the old one.',         12400, 4, true),
  ('Clutch Replacement',       'clutch-replacement',       'clutch',    'Full clutch kit replacement (clutch disc, pressure plate, release bearing). Labour-heavy job.',           29800, 5, true),
  ('MOT Pre-check',            'mot-precheck',             'mot',       'Pre-MOT inspection covering all common failure points so you can fix issues before the test.',             5900, 6, true),
  ('Interim Service',          'interim-service',          'service',   'Six-month or 6,000-mile interim service: oil, oil filter and a safety check.',                            12900, 7, true),
  ('Front Brake Discs & Pads', 'front-brake-discs-pads',   'brakes',    'Replacement of front brake discs and pads. Recommended every 50,000 miles.',                              22900, 8, true),
  ('Cambelt Replacement',      'cambelt-replacement',      'other',     'Replacement of timing belt and tensioner per manufacturer schedule. Often paired with water pump.',       34900, 9, true),
  ('Air-Con Regas',            'air-con-regas',            'other',     'Recharge of the air-conditioning system with refrigerant. Includes leak check.',                            8900, 10, true)
on conflict (slug) do nothing;
