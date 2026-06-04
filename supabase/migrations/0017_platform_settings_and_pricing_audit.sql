-- 0017_platform_settings_and_pricing_audit.sql
-- Task 08 Stage 2 — admin pricing controls.
--
-- platform_settings: a small key/value store for the platform-wide commission
-- defaults and cancellation-fee tiers edited on /admin/pricing.
-- pricing_audit_log: who changed which pricing knob, when, and from/to what.
-- All pricing writes (base prices, commission, multipliers, overrides, fees,
-- defaults) record an audit row.
--
-- Idempotent: safe to re-run.

create table if not exists public.platform_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id)
);

-- Seed the defaults. Re-running never clobbers an admin's edits.
insert into public.platform_settings (key, value) values
  ('take_rate_base',               '0.15'::jsonb),   -- fallback commission rate
  ('take_rate_pro',                '0.12'::jsonb),   -- Pro tier commission rate (Task 11)
  ('cancel_fee_before_24h',        '0'::jsonb),      -- pence, cancelled >24h before slot
  ('cancel_fee_within_24h',        '3000'::jsonb),   -- pence, cancelled within 24h
  ('cancel_fee_mechanic_en_route', '5000'::jsonb)    -- pence, mechanic already on the way
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- pricing_audit_log — append-only trail of pricing changes.
-- ---------------------------------------------------------------------------
create table if not exists public.pricing_audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references public.profiles(id),
  -- 'service' | 'area' | 'service_area_price' | 'platform_setting'
  entity     text not null,
  entity_id  text,           -- the row id / setting key the change applies to
  field      text not null,  -- which attribute changed
  old_value  jsonb,
  new_value  jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pricing_audit_log_entity_idx
  on public.pricing_audit_log (entity, entity_id);
create index if not exists pricing_audit_log_created_idx
  on public.pricing_audit_log (created_at desc);

-- ---------------------------------------------------------------------------
-- RLS. Both tables are admin-only; the pricing engine reads take_rate_base via
-- the service-role client (bypasses RLS), so no public read policy is needed.
-- ---------------------------------------------------------------------------
alter table public.platform_settings enable row level security;
alter table public.pricing_audit_log enable row level security;

drop policy if exists "Admins manage platform settings" on public.platform_settings;
create policy "Admins manage platform settings" on public.platform_settings
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins read pricing audit" on public.pricing_audit_log;
create policy "Admins read pricing audit" on public.pricing_audit_log
  for select using (public.is_admin());
-- No INSERT policy: audit rows are written by server actions via the
-- service-role client, never directly by a browser session.
