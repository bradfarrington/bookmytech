-- 0039_repair_exclusions.sql
-- Per-model repair availability (Task 16 Stage G follow-up, owner request
-- 2026-07-10).
--
-- The admin can switch OFF individual repairs or whole repair GROUPS on the
-- model page's Repair times tab. Excluded nodes disappear from the customer
-- "Repairs for your car" browser (a hidden group hides everything beneath it,
-- since customers can no longer drill into it) and quoteRepair refuses to
-- price them, so a stale/crafted URL can't book one.
--
-- Rows key on HaynesPro make/model NAMES (stable across their quarterly DB
-- updates) + the repair-tree node id. Node ids are HaynesPro's structured AW
-- position codes; if a quarterly update ever renames one, the row simply
-- stops matching (fails open — the repair shows again) and the admin
-- re-toggles it.
--
-- Idempotent: safe to re-run.

create table if not exists public.repair_vehicle_exclusions (
  id          uuid primary key default gen_random_uuid(),
  make_name   text not null,   -- HaynesPro make name, e.g. "FORD"
  model_name  text not null,   -- HaynesPro model name, e.g. "Ranger"
  node_id     text not null,   -- repair-tree node id (group or timed leaf)
  description text,            -- snapshot of the node label for admin display
  created_at  timestamptz not null default now(),
  unique (make_name, model_name, node_id)
);

alter table public.repair_vehicle_exclusions enable row level security;

-- Admin UI lists them; the booking funnel and admin writes go through the
-- service-role client.
drop policy if exists "Admins can view repair exclusions" on public.repair_vehicle_exclusions;
create policy "Admins can view repair exclusions"
  on public.repair_vehicle_exclusions for select
  using (public.is_admin());
