-- 0037_service_vehicle_exclusions.sql
-- Per-vehicle service availability (Task 16 Stage D).
--
-- Services are available on EVERY vehicle by default; the admin switches a
-- service OFF for a specific model (e.g. no cambelt service on an EV). Rows
-- key on HaynesPro make/model NAMES — names are stable across HaynesPro's
-- quarterly database updates, their numeric ids are not.
--
-- Matching (lib/haynespro/exclusions.ts): a booking vehicle is excluded when
-- normalise(make_name ‖ ' ' ‖ model_name) equals the cached vehicle's
-- normalised hp_model_label (0036). Unresolvable vehicles match nothing, so
-- unknown/new cars always see the full service list — the funnel never shrinks
-- by accident.
--
-- Idempotent: safe to re-run.

create table if not exists public.service_vehicle_exclusions (
  id          uuid primary key default gen_random_uuid(),
  service_id  uuid not null references public.services(id) on delete cascade,
  make_name   text not null,   -- HaynesPro make name, e.g. "VOLKSWAGEN"
  model_name  text not null,   -- HaynesPro model name, e.g. "Golf IV (1J)"
  created_at  timestamptz not null default now(),
  unique (service_id, make_name, model_name)
);

alter table public.service_vehicle_exclusions enable row level security;

-- Admin UI lists them; the booking funnel and admin writes go through the
-- service-role client.
drop policy if exists "Admins can view vehicle exclusions" on public.service_vehicle_exclusions;
create policy "Admins can view vehicle exclusions"
  on public.service_vehicle_exclusions for select
  using (public.is_admin());
