-- 0090_parts_gaps.sql
-- Closing the parts NAPA Auto Parts can't price (Task 77).
--
-- Six new tables, nothing existing changed:
--
--   aag_engine_codes      A car's engine codes as NAPA's exact-match answers
--                         give them ("BF2X"), so a catalogue part limited to
--                         one engine is priced when it's this car's engine.
--   part_code_maps        HaynesPro part-type code -> the code NAPA stocks the
--                         same named part under (brake fluid 71 -> 3357).
--                         Proposed by us, used only once Gareth approves.
--   model_part_choices    The NAPA part Gareth picked for a model and part
--                         type, for when NAPA lists nothing for that model.
--                         Identity only: the price is always NAPA's live one.
--   aag_product_prices    NAPA's live price for a part number
--                         (/api/product/info), cached like aag_part_prices.
--   part_gaps             Part types NAPA had nothing for, per model, as
--                         customers look cars up.
--   model_part_scans      One registration's whole repair list for a model,
--                         with the part types each repair needs: what the
--                         Parts gaps screen lays out by HaynesPro category.
--
-- RLS on every table: admins can read; every write, and every read on the
-- customer path, goes through the service-role client, as with
-- aag_part_prices (0070). The mobile apps never read these tables.
--
-- Idempotent: safe to re-run.

-- --- aag_engine_codes -------------------------------------------------------

create table if not exists public.aag_engine_codes (
  reg      text        primary key,                      -- normalised: uppercase, no spaces
  codes    text[]      not null default '{}'::text[],    -- upper case, e.g. {C14HDEZ,SPJC}
  seen_at  timestamptz not null default now()
);

alter table public.aag_engine_codes enable row level security;

drop policy if exists "Admins read engine codes" on public.aag_engine_codes;
create policy "Admins read engine codes" on public.aag_engine_codes
  for select using (public.is_admin());

comment on table public.aag_engine_codes is
  'Every engine code NAPA''s exact-match answers (/api/quote, "Engine Code") have given for a registration (Task 77). A catalogue part limited to engine codes is priced when one of them is listed.';

-- --- part_code_maps ---------------------------------------------------------

create table if not exists public.part_code_maps (
  genart_id      integer     primary key check (genart_id > 0),   -- HaynesPro's code
  napa_genart_id integer     not null check (napa_genart_id > 0), -- the code NAPA answers to
  label          text,                                            -- HaynesPro's name, e.g. "Brake fluid"
  napa_label     text,                                            -- NAPA's name for it, for the admin
  status         text        not null default 'proposed'
                             check (status in ('proposed', 'approved', 'rejected')),
  evidence       jsonb       not null default '{}'::jsonb,        -- what the probe found
  proposed_at    timestamptz not null default now(),
  decided_by     uuid        references public.profiles(id),
  decided_at     timestamptz,
  check (genart_id <> napa_genart_id)
);

alter table public.part_code_maps enable row level security;

drop policy if exists "Admins read part code maps" on public.part_code_maps;
create policy "Admins read part code maps" on public.part_code_maps
  for select using (public.is_admin());

comment on table public.part_code_maps is
  'HaynesPro part-type code to the code NAPA stocks the same named part under (Task 77). Only approved rows are used, for every car.';

-- --- model_part_choices -----------------------------------------------------

create table if not exists public.model_part_choices (
  id          uuid        primary key default gen_random_uuid(),
  make_name   text        not null,   -- haynespro_vehicle_cache.hp_make, e.g. "FORD"
  model_label text        not null,   -- haynespro_vehicle_cache.hp_model_label, e.g. "FORD Ranger"
  genart_id   integer     not null check (genart_id > 0),
  position    text        check (position in ('front', 'rear')),  -- null: either axle / not axle-specific
  product_id  text        not null,   -- NAPA's ProductId
  label       text,                   -- HaynesPro's part-type name, for display
  brand       text,
  description text,
  chosen_by   uuid        references public.profiles(id),
  chosen_at   timestamptz not null default now()
);

create unique index if not exists model_part_choices_unique
  on public.model_part_choices (make_name, model_label, genart_id, coalesce(position, ''));

alter table public.model_part_choices enable row level security;

drop policy if exists "Admins read model part choices" on public.model_part_choices;
create policy "Admins read model part choices" on public.model_part_choices
  for select using (public.is_admin());

comment on table public.model_part_choices is
  'The NAPA part an admin picked for a model and part type, used when NAPA lists nothing for that model (Task 77). Identity only, never price.';

-- --- aag_product_prices -----------------------------------------------------

create table if not exists public.aag_product_prices (
  product_id text        primary key,
  state      text        not null check (state in ('ok', 'missing')),
  info       jsonb       not null default '{}'::jsonb,   -- NAPA's /api/product/info entry
  fetched_at timestamptz not null default now()
);

alter table public.aag_product_prices enable row level security;

drop policy if exists "Admins read product prices" on public.aag_product_prices;
create policy "Admins read product prices" on public.aag_product_prices
  for select using (public.is_admin());

comment on table public.aag_product_prices is
  'NAPA''s price for a part number (/api/product/info), for parts picked per model (Task 77). Used as-is for 12 hours; as a last known price for up to 7 days.';

-- --- part_gaps --------------------------------------------------------------

create table if not exists public.part_gaps (
  make_name     text        not null,
  model_label   text        not null,
  genart_id     integer     not null check (genart_id > 0),
  label         text,                 -- HaynesPro's part-type name
  sample_repair text,                 -- a repair that needs it
  last_reg      text,                 -- the last registration it was missing on
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  primary key (make_name, model_label, genart_id)
);

create index if not exists part_gaps_last_seen on public.part_gaps (last_seen_at desc);

alter table public.part_gaps enable row level security;

drop policy if exists "Admins read part gaps" on public.part_gaps;
create policy "Admins read part gaps" on public.part_gaps
  for select using (public.is_admin());

comment on table public.part_gaps is
  'Part types NAPA had no part for on a model, recorded as customers price repairs (Task 77). Feeds the admin Parts gaps screen.';

-- --- model_part_scans -------------------------------------------------------

create table if not exists public.model_part_scans (
  make_name          text        not null,   -- haynespro_vehicle_cache.hp_make
  model_label        text        not null,   -- haynespro_vehicle_cache.hp_model_label
  reg                text        not null,   -- the registration scanned
  car_type_id        integer     not null,
  vehicle            text,                   -- HaynesPro's description, e.g. "Ranger 3.0 EcoBlue"
  repairs            jsonb       not null default '[]'::jsonb,  -- [{id, name, path:[{id,name}], groups:[{genartId,label}]}]
  scanned_by         uuid        references public.profiles(id),
  scanned_at         timestamptz not null default now(),
  primary key (make_name, model_label)
);

alter table public.model_part_scans enable row level security;

drop policy if exists "Admins read model part scans" on public.model_part_scans;
create policy "Admins read model part scans" on public.model_part_scans
  for select using (public.is_admin());

comment on table public.model_part_scans is
  'A model''s repairs that charge for parts, from one registration''s HaynesPro tree (Task 77). NAPA''s answers stay in aag_part_prices; hides are applied when the screen is drawn.';

-- --- The first proposals --------------------------------------------------
-- Found by comparing HaynesPro's part-type names across 11 scanned cars
-- (S28BSW and ten others, 2026-11-17): only these names appear under two
-- codes where NAPA answers to one code and has nothing on the other. Checked
-- live, read-only, on S28BSW (2024 Ranger), FN60KYP (2010 Fiesta) and
-- LA16DCV (2016 BMW 3). Proposed only: nothing changes until an admin
-- approves each one on the Parts gaps screen.

insert into public.part_code_maps (genart_id, napa_genart_id, label, napa_label, status, evidence)
values
  (71, 3357, 'Brake fluid', 'Brake fluid', 'proposed', jsonb_build_object(
    'reg', 'S28BSW', 'parts', 4, 'sample', 'Febi Bilstein DOT 4, 1 litre',
    'note', '71 has nothing on any of the 3 cars; 3357 prices on all 3. NAPA lists the same fluid in 0.25, 0.5, 1 and 5 litre bottles, and the default pick (dearest) is the 5 litre one.')),
  (289, 2484, 'Front fog light', 'Front fog light', 'proposed', jsonb_build_object(
    'reg', 'S28BSW', 'parts', 2,
    'note', '289 has nothing on any of the 3 cars; 2484 prices on all 3, the Ranger included.')),
  (2482, 259, 'Headlight', 'Headlight', 'proposed', jsonb_build_object(
    'reg', 'FN60KYP', 'parts', 15,
    'note', '2482 has nothing on any of the 3 cars; 259 prices on the Fiesta and the BMW (not the Ranger, where NAPA lists no headlights).'))
on conflict (genart_id) do nothing;
