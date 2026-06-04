-- 0022_areas_multi_city.sql
-- Task 10 Stage 3 — multi-city expansion tooling.
--
-- Extends `areas` with the lifecycle + recruitment fields the area-setup wizard
-- and areas overview need, and tags mechanic applications with the area they
-- came from (so ops can track recruitment per city).
--
-- Lifecycle: `status` ('active' | 'planned' | 'paused') is the ops-facing state
-- the wizard drives. `is_active` (from 0016) stays the PRICING ENGINE gate —
-- only 'active' areas resolve a postcode + price a booking. The wizard keeps the
-- two in sync (Activate → status='active' + is_active=true).
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. areas — recruitment + lifecycle columns.
-- ---------------------------------------------------------------------------
alter table public.areas
  add column if not exists slug                  text,
  add column if not exists status                text not null default 'active'
    check (status in ('active', 'planned', 'paused')),
  add column if not exists target_mechanic_count integer,
  add column if not exists referral_code         text,
  add column if not exists recruitment_headline  text,
  add column if not exists recruitment_blurb      text,
  add column if not exists launch_checklist       jsonb not null default '{}'::jsonb,
  add column if not exists acquisition_budget_pence integer;

-- Backfill a URL slug for every existing area from its name, then enforce
-- uniqueness. trim leading/trailing hyphens from the regexp result.
update public.areas
   set slug = trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))
 where slug is null or slug = '';

create unique index if not exists areas_slug_key on public.areas (slug);

-- Existing seeded areas were all live; "Default" is the catch-all, leave active.
update public.areas set status = 'active' where status is null;

-- ---------------------------------------------------------------------------
-- 2. mechanic_applications — originating area.
-- ---------------------------------------------------------------------------
alter table public.mechanic_applications
  add column if not exists source_area_id uuid references public.areas(id);

create index if not exists mechanic_applications_area_idx
  on public.mechanic_applications (source_area_id);
