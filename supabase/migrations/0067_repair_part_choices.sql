-- 0067_repair_part_choices.sql
-- Task 45 — which part a repair uses on one engine variant, when an admin has
-- changed it from the default.
--
-- ⚠️ SCHEMA CHANGE — the mobile app generates its TypeScript types from the
-- live schema, so `npm run db:types` must be re-run there after this applies.
-- Nothing customer-facing: the table is admin-only, and no existing table
-- changes.
--
-- The default part for a repair's part group is the DEAREST either supplier
-- (LKQ, Alliance Automotive) will sell us for that vehicle (owner decision,
-- 2026-09-14). It is computed live and never stored. A row here exists only
-- when an admin picked a different part on the vehicle's model page.
--
-- Scope is the HaynesPro CAR TYPE (engine variant), not the model: parts
-- genuinely differ by engine (owner decision, same day). The part is stored
-- by identity — supplier + part number — never by price, so the price shown is
-- always today's. If the chosen part stops being offered, the app falls back
-- to the dearest and says so (lib/parts/repair-part-choice.ts).
--
-- Idempotent: safe to re-run.

create table if not exists public.repair_part_choices (
  car_type_id integer not null check (car_type_id > 0),
  -- HaynesPro repair-time node id (the same job on every make, docs/tasks/23).
  node_id     text    not null,
  -- The TecDoc part group within that repair (a repair can use several).
  genart_id   integer not null check (genart_id > 0),
  supplier    text    not null check (supplier in ('lkq', 'aag')),
  part_number text    not null,
  -- Snapshots for display if the part later disappears from results.
  brand       text,
  description text,
  chosen_by   uuid references public.profiles(id),
  chosen_at   timestamptz not null default now(),
  primary key (car_type_id, node_id, genart_id)
);

alter table public.repair_part_choices enable row level security;

-- Written only by admin server actions through the service-role client; the
-- SELECT policy exists for parity with the repair catalogue tables (0056).
drop policy if exists "Admins read repair part choices" on public.repair_part_choices;
create policy "Admins read repair part choices" on public.repair_part_choices
  for select using (public.is_admin());

comment on table public.repair_part_choices is
  'Admin override of the default (dearest) supplier part for a repair''s part group on one HaynesPro car type (Task 45). Identity only, never price.';
