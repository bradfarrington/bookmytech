-- 0088_product_fuels_and_info_sheets.sql
-- Task 74 — products for one fuel, a "before you book" sheet, and the DPF services.
--
-- ⚠️ SCHEMA CHANGE — the mobile apps generate their TypeScript types from the
-- live schema, so `npm run db:types` must be re-run in both after this
-- applies. Neither app reads catalogue_products directly (admin-only RLS); the
-- product nodes they get from the API only GAIN an optional field.
--
-- 1. catalogue_products.fuel_types — the fuels a product is offered for
--    ('petrol' | 'diesel' | 'electric'); null = every vehicle, as before. The
--    catalogue lists a product only for a car of one of its fuels
--    (lib/catalogue/products.ts productsForFuel; a hybrid counts as petrol).
-- 2. Two products may now share a name in a category when their fuels differ,
--    so a petrol and a diesel "Major service" can each say what they include.
-- 3. catalogue_products.info_sheet — what the customer reads before booking:
--    shown under the price and in the booking confirmation email.
-- 4. Data (Brad, 2026-11-13):
--    • "Major service" is split: the existing row becomes petrol-only (spark
--      plugs); a diesel copy without spark plugs is added at the same price,
--      duration and checklist. Glow plugs stay a separate repair.
--    • Diesel-only "DPF chemical clean and regeneration" £139.99 and "DPF
--      forced regeneration" £89.99 under Servicing, with Brad's DPF sheet.
--      Visit lengths (2 h / 1 h) are placeholders; edit them in /admin/services.
--
-- Deploy order: either. Before this applies the site reads products without
-- the new columns (lib/catalogue/load-products.ts) and nothing is filtered.
--
-- Idempotent: safe to re-run.

alter table public.catalogue_products
  add column if not exists fuel_types text[],
  add column if not exists info_sheet text;

alter table public.catalogue_products
  drop constraint if exists catalogue_products_fuel_types_check;
alter table public.catalogue_products
  add constraint catalogue_products_fuel_types_check
  check (fuel_types is null or fuel_types <@ array['petrol', 'diesel', 'electric']::text[]);

alter table public.catalogue_products
  drop constraint if exists catalogue_products_info_sheet_check;
alter table public.catalogue_products
  add constraint catalogue_products_info_sheet_check
  check (info_sheet is null or char_length(info_sheet) <= 8000);

comment on column public.catalogue_products.fuel_types is
  'Fuels this product is offered for (petrol, diesel, electric); null = every vehicle. A hybrid counts as petrol (Task 74).';
comment on column public.catalogue_products.info_sheet is
  'What the customer reads before booking: "## " headings, "- " bullets, paragraphs. Shown under the price and in the booking confirmation email (Task 74).';

-- One name per category per set of fuels.
drop index if exists public.catalogue_products_category_name_key;
create unique index if not exists catalogue_products_category_name_fuels_key
  on public.catalogue_products (category, lower(name), coalesce(array_to_string(fuel_types, ','), ''));

-- Major service: a diesel copy without spark plugs, taken from the live row so
-- the admin's current price, duration and checklist carry over.
insert into public.catalogue_products
  (category, name, summary, description, price_pence, labour_hours, duration_hours,
   includes_engine_oil, display_order, is_active, checklist_id, checklist_tier, fuel_types)
select
  p.category,
  p.name,
  replace(replace(p.summary, 'oil, all filters and spark plugs', 'oil and all filters'), ' and spark plugs', ''),
  nullif(regexp_replace(p.description, '(^|\n)[^\n]*[Ss]park plugs?[^\n]*', '', 'g'), ''),
  p.price_pence, p.labour_hours, p.duration_hours,
  p.includes_engine_oil, p.display_order, p.is_active, p.checklist_id, p.checklist_tier,
  array['diesel']
from public.catalogue_products p
where p.category = 'servicing'
  and lower(p.name) = 'major service'
  and p.fuel_types is null
  and not exists (
    select 1 from public.catalogue_products d
    where d.category = 'servicing' and lower(d.name) = 'major service' and d.fuel_types = array['diesel']
  );

-- ...and the original becomes the petrol one.
update public.catalogue_products
set fuel_types = array['petrol'],
    description = replace(description, 'Spark plugs replaced (petrol)', 'Spark plugs replaced'),
    updated_at = now()
where category = 'servicing'
  and lower(name) = 'major service'
  and fuel_types is null;

-- The DPF services, diesel only, after the services in the list.
insert into public.catalogue_products
  (category, name, summary, description, price_pence, labour_hours, duration_hours,
   includes_engine_oil, display_order, is_active, fuel_types, info_sheet)
values
  ('servicing', 'DPF chemical clean and regeneration',
   'For diesels: a blocked DPF chemically cleaned, then regenerated with diagnostic equipment',
   'DPF history and fault codes checked' || chr(10) ||
   'Cleaning chemical injected into the DPF through a sensor port and left to soak' || chr(10) ||
   'Forced regeneration with diagnostic equipment' || chr(10) ||
   'DPF performance checked afterwards',
   13999, null, 2, false, 10, true, array['diesel'],
   'When your Diesel Particulate Filter (DPF) is too blocked for a standard forced regeneration, or the ash build-up has gone past its safe limit, it needs a proper chemical clean to get things moving again.' || chr(10) || chr(10) ||
   '## How we do it' || chr(10) ||
   '- Diagnostic check: our technician starts by checking your car''s DPF history to confirm it has failed to complete a regeneration.' || chr(10) ||
   '- Chemical soak: we inject specialist cleaning chemicals directly into the DPF through a sensor port and let them soak in to break down the stubborn soot and ash.' || chr(10) ||
   '- Forced regeneration: using our diagnostic equipment, we run a forced regeneration to burn off the loosened deposits.' || chr(10) ||
   '- Final performance check: we test how the DPF is breathing afterwards and let you know if the internal core has failed or needs further attention.' || chr(10) || chr(10) ||
   '## Common signs you need a DPF clean' || chr(10) ||
   '- The DPF warning light has come on on your dashboard.' || chr(10) ||
   '- Your car has dropped into ''safe'' or ''limp'' mode.' || chr(10) ||
   '- Noticeable loss of power when accelerating.' || chr(10) ||
   '- You are using more fuel than usual.' || chr(10) ||
   '- Trouble starting the engine.' || chr(10) ||
   '- A standard regeneration hasn''t cleared the soot build-up.' || chr(10) || chr(10) ||
   '## Before you book: how our service charge works' || chr(10) ||
   'We want to be completely upfront with you before you book. Our DPF cleaning and regeneration fee applies whether or not the filter clears.' || chr(10) ||
   '- What you are paying for: your fee covers our technician''s time, specialist diagnostic equipment, and the cleaning chemicals used to carry out the job properly.' || chr(10) ||
   '- Why we cannot guarantee a fix: while our technicians always do their best to save your filter, some DPFs are simply too heavily blocked, damaged inside, or held back by another engine or exhaust fault.' || chr(10) || chr(10) ||
   'Because our time, tools and cleaning fluids are used up during the attempt, the full service charge still applies even if your DPF cannot be recovered and needs replacing.' || chr(10) || chr(10) ||
   'Please note: DPF cleaning and regeneration services are excluded from Book My Tech''s 12-month / 12,000-mile warranty.'),
  ('servicing', 'DPF forced regeneration',
   'For diesels: soot burned out of the DPF with a regeneration run from diagnostic equipment',
   'DPF history and fault codes checked' || chr(10) ||
   'Forced regeneration with diagnostic equipment' || chr(10) ||
   'DPF performance checked afterwards',
   8999, null, 1, false, 11, true, array['diesel'],
   'When your Diesel Particulate Filter (DPF) hasn''t been able to clear itself, a forced regeneration run from diagnostic equipment can burn off the soot that has built up. If the filter is too blocked for that, it needs our DPF chemical clean instead.' || chr(10) || chr(10) ||
   '## How we do it' || chr(10) ||
   '- Diagnostic check: our technician starts by checking your car''s DPF history to confirm it has failed to complete a regeneration.' || chr(10) ||
   '- Forced regeneration: using our diagnostic equipment, we run a forced regeneration to burn off the soot in the filter.' || chr(10) ||
   '- Final performance check: we test how the DPF is breathing afterwards and let you know if it needs a chemical clean or further attention.' || chr(10) || chr(10) ||
   '## Common signs you need a DPF regeneration' || chr(10) ||
   '- The DPF warning light has come on on your dashboard.' || chr(10) ||
   '- Your car has dropped into ''safe'' or ''limp'' mode.' || chr(10) ||
   '- Noticeable loss of power when accelerating.' || chr(10) ||
   '- You are using more fuel than usual.' || chr(10) ||
   '- Trouble starting the engine.' || chr(10) || chr(10) ||
   '## Before you book: how our service charge works' || chr(10) ||
   'We want to be completely upfront with you before you book. Our DPF cleaning and regeneration fee applies whether or not the filter clears.' || chr(10) ||
   '- What you are paying for: your fee covers our technician''s time and specialist diagnostic equipment used to carry out the job properly.' || chr(10) ||
   '- Why we cannot guarantee a fix: while our technicians always do their best to save your filter, some DPFs are simply too heavily blocked, damaged inside, or held back by another engine or exhaust fault.' || chr(10) || chr(10) ||
   'Because our time and tools are used up during the attempt, the full service charge still applies even if your DPF cannot be recovered and needs a chemical clean or replacing.' || chr(10) || chr(10) ||
   'Please note: DPF cleaning and regeneration services are excluded from Book My Tech''s 12-month / 12,000-mile warranty.')
on conflict do nothing;
