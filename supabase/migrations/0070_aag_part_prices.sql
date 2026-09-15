-- 0070_aag_part_prices.sql
-- Task 43 — Alliance Automotive parts in customer prices.
--
-- ⚠️ SCHEMA CHANGE — the mobile app generates its TypeScript types from the
-- live schema, so `npm run db:types` must be re-run there after this applies.
-- `booking_parts` is customer-readable: it only GAINS columns, all nullable or
-- defaulted, so old app builds are unaffected.
--
-- Until this is applied the app prices repairs without parts, exactly as
-- before: lib/parts/part-group-settings.ts switches parts pricing off while the
-- tables are missing.
--
-- Idempotent: safe to re-run.

-- 1. AAG's answer for one part group on one registration. The offers are
--    kept, never the selection, so an admin's part choice applies at once
--    while the price holds steady through the booking funnel.
create table if not exists public.aag_part_prices (
  reg         text        not null,          -- normalised: uppercase, no spaces
  genart_id   integer     not null check (genart_id > 0),
  state       text        not null check (state in ('ok', 'empty')),
  offers      jsonb       not null default '[]'::jsonb,
  fetched_at  timestamptz not null default now(),
  primary key (reg, genart_id)
);

alter table public.aag_part_prices enable row level security;
-- No policies: only the service-role client in lib/parts/ reads or writes it.

comment on table public.aag_part_prices is
  'Alliance Automotive offers for a part group on a registration (Task 43). Used as-is for 12 hours; as a last known price for up to 7 days when AAG cannot answer.';

-- 2. Part groups an admin has switched off, so customers are never charged for
--    them (a workshop tool, not a part). A missing row means charged.
create table if not exists public.part_group_settings (
  genart_id   integer     primary key check (genart_id > 0),
  description text,
  charged     boolean     not null default true,
  changed_by  uuid        references public.profiles(id),
  changed_at  timestamptz not null default now()
);

alter table public.part_group_settings enable row level security;

drop policy if exists "Admins read part group settings" on public.part_group_settings;
create policy "Admins read part group settings" on public.part_group_settings
  for select using (public.is_admin());

comment on table public.part_group_settings is
  'Whether customers are charged for a TecDoc part group when a repair uses it (Task 43). Writes go through admin server actions.';

-- 3. The exact part priced into a booking, so the mechanic knows what to buy
--    and a later dispute can see it.
alter table public.booking_parts
  add column if not exists source               text not null default 'manual',
  add column if not exists supplier             text,
  add column if not exists supplier_part_number text,
  add column if not exists brand                text,
  add column if not exists genart_id            integer,
  add column if not exists node_id              text,
  add column if not exists priced_at            timestamptz;

alter table public.booking_parts drop constraint if exists booking_parts_source_check;
alter table public.booking_parts
  add constraint booking_parts_source_check check (source in ('manual', 'catalogue'));

comment on column public.booking_parts.source is
  'manual = added by a mechanic or from a follow-on quote; catalogue = priced into the booking from Alliance Automotive (Task 43).';
