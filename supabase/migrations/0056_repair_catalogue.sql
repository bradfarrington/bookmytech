-- 0056_repair_catalogue.sql
-- Our own layer over HaynesPro's repair tree (Task 26, owner requests
-- 2026-09-04): rename its categories, create our own, move repairs from one
-- category to another, and offer COMBINED repairs ("Brake pads & discs" with
-- a Front / Rear choice) alongside the separate jobs.
--
-- HaynesPro stays the source of every job and every time; nothing here prices
-- anything. A combined repair is a named set of HaynesPro node ids priced
-- through the same quote as any other booking. Node ids mean the same job on
-- every make (verified live, docs/tasks/23), which is what lets one overlay
-- apply to every vehicle.
--
-- Ids customers see: HaynesPro ids as before; "g:<uuid>" for a category we
-- created; "b:<option uuid>" for one bookable option of a combined repair.
-- All four tables are read server-side through the service-role client
-- (lib/catalogue/load-overlay.ts) and written only by admin actions; the
-- admin SELECT policies exist for parity with repair_vehicle_exclusions.
--
-- Idempotent: safe to re-run.

-- Categories we created. parent_id is 'root', a HaynesPro group id, or another
-- custom category's "g:<uuid>".
create table if not exists public.repair_catalogue_groups (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  parent_id     text not null default 'root',
  display_order integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists repair_catalogue_groups_parent_idx
  on public.repair_catalogue_groups (parent_id, display_order);

-- Per-HaynesPro-node changes: a custom name, and/or where it now lives.
-- parent_id null = where HaynesPro lists it. description is a snapshot of
-- HaynesPro's name for the admin lists (same reasoning as exclusions).
create table if not exists public.repair_catalogue_overrides (
  node_id       text primary key,
  kind          text not null check (kind in ('group', 'repair')),
  description   text,
  custom_name   text,
  parent_id     text,
  display_order integer,
  updated_at    timestamptz not null default now()
);
create index if not exists repair_catalogue_overrides_parent_idx
  on public.repair_catalogue_overrides (parent_id);

-- Combined repairs. Listed under parent_id like a category's child. node_ids
-- is the POOL of HaynesPro jobs the admin added once; each option ("Front",
-- "Rear", "All round") is the bookable thing and picks a subset of that pool.
create table if not exists public.repair_bundles (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  parent_id     text not null default 'root',
  node_ids      text[] not null default '{}',
  display_order integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists repair_bundles_parent_idx
  on public.repair_bundles (parent_id, display_order);

create table if not exists public.repair_bundle_options (
  id         uuid primary key default gen_random_uuid(),
  bundle_id  uuid not null references public.repair_bundles(id) on delete cascade,
  label      text not null,
  node_ids   text[] not null default '{}',
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists repair_bundle_options_bundle_idx
  on public.repair_bundle_options (bundle_id, position);

alter table public.repair_catalogue_groups    enable row level security;
alter table public.repair_catalogue_overrides enable row level security;
alter table public.repair_bundles             enable row level security;
alter table public.repair_bundle_options      enable row level security;

drop policy if exists "Admins read catalogue groups" on public.repair_catalogue_groups;
create policy "Admins read catalogue groups" on public.repair_catalogue_groups
  for select using (public.is_admin());
drop policy if exists "Admins read catalogue overrides" on public.repair_catalogue_overrides;
create policy "Admins read catalogue overrides" on public.repair_catalogue_overrides
  for select using (public.is_admin());
drop policy if exists "Admins read bundles" on public.repair_bundles;
create policy "Admins read bundles" on public.repair_bundles
  for select using (public.is_admin());
drop policy if exists "Admins read bundle options" on public.repair_bundle_options;
create policy "Admins read bundle options" on public.repair_bundle_options
  for select using (public.is_admin());

-- A booking line that came from a combined repair remembers which one, so the
-- customer's screens can show "Brake pads & discs · Front" above the two real
-- jobs the mechanic does. Null on lines booked as single jobs.
alter table public.booking_repairs add column if not exists item_id text;
alter table public.booking_repairs add column if not exists item_label text;

comment on table public.repair_catalogue_groups is
  'Categories the admin created over HaynesPro''s repair tree (Task 26). Customers see them as groups with id g:<uuid>.';
comment on table public.repair_catalogue_overrides is
  'Per-HaynesPro-node custom name and/or new parent (Task 26). parent_id null = where HaynesPro lists it.';
comment on table public.repair_bundles is
  'Combined repairs (Task 26): a named pool of HaynesPro jobs (node_ids), offered alongside the separate ones.';
comment on table public.repair_bundle_options is
  'The bookable options of a combined repair ("Front", "Rear"), each a subset of the bundle''s pool. Customers see id b:<uuid>.';
