-- Task 02 Stage 4 — service categories CRUD.
--
-- Replaces the previously-static category enum (lib/services.ts) with an
-- admin-managed table. `services.category` remains a plain text column that
-- stores the category's slug; this is a soft reference (no FK constraint) so
-- renaming a category's display name is free and the migration is non-destructive.
-- The admin UI enforces semantic integrity (blocks deletes when in use).
--
-- Idempotent: safe to re-run.

-- 1. Ensure the is_admin() helper exists. Defined in the Stage 3 RLS fix; we
--    redeclare here so a fresh-environment run of this migration works on its
--    own without depending on a one-shot SQL editor paste.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

-- 2. service_categories table
create table if not exists service_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table service_categories enable row level security;

-- 3. Policies — public read (active rows only), admin write
drop policy if exists "Categories are viewable by everyone" on service_categories;
create policy "Categories are viewable by everyone"
  on service_categories for select
  using (is_active = true);

drop policy if exists "Admins can view all categories" on service_categories;
create policy "Admins can view all categories"
  on service_categories for select
  using (public.is_admin());

drop policy if exists "Admins can insert categories" on service_categories;
create policy "Admins can insert categories"
  on service_categories for insert
  with check (public.is_admin());

drop policy if exists "Admins can update categories" on service_categories;
create policy "Admins can update categories"
  on service_categories for update
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can delete categories" on service_categories;
create policy "Admins can delete categories"
  on service_categories for delete
  using (public.is_admin());

-- 4. Seed the 8 categories that existed as a static enum, matching the slugs
--    that the seed services from 0001 already reference.
insert into service_categories (name, slug, display_order) values
  ('Service',    'service',    1),
  ('Diagnostic', 'diagnostic', 2),
  ('Brakes',     'brakes',     3),
  ('Tyres',      'tyres',      4),
  ('Battery',    'battery',    5),
  ('Clutch',     'clutch',     6),
  ('MOT',        'mot',        7),
  ('Other',      'other',      8)
on conflict (slug) do nothing;
