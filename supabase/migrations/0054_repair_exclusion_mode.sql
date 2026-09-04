-- 0054_repair_exclusion_mode.sql
-- Global repair hides with per-model overrides (Task 23, owner request
-- 2026-09-04: "turn it off globally … but keep the toggles for each vehicle
-- as well so we can override the global per vehicle").
--
-- repair_vehicle_exclusions (0039) held one kind of row: (make, model, node)
-- = "hidden for that model". Two things change, neither of which needs a new
-- table:
--
--   1. A GLOBAL hide is a row whose make_name AND model_name are both the
--      sentinel '*'. It hides the node for every vehicle. The sentinel can
--      never equal a real HaynesPro model label, so such rows are inert to
--      code that predates this migration (they simply match nothing).
--
--   2. `mode` says what a row does: 'hide' (the only behaviour until now, so
--      it is the default and every existing row keeps it) or 'show' — a
--      per-model OVERRIDE that re-enables a node hidden for all vehicles on
--      that one model. A 'show' row only ever exists alongside a global hide
--      for the same node; lifting the global hide removes its overrides.
--
-- Effective hidden set for a vehicle =
--   (global hides − this model's 'show' rows) ∪ this model's 'hide' rows
-- — see lib/haynespro/exclusions.ts, which is the single matcher for the
-- customer browser, the search walker and quoteRepair.
--
-- The unique key (make_name, model_name, node_id) is unchanged: a model holds
-- at most one row per node, and its `mode` flips between hide and show.
-- RLS unchanged (admin SELECT; service-role writes). The mobile app never
-- reads this table — regenerate its types and move on.
--
-- Idempotent: safe to re-run.

alter table public.repair_vehicle_exclusions
  add column if not exists mode text not null default 'hide';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'repair_vehicle_exclusions_mode_check'
  ) then
    alter table public.repair_vehicle_exclusions
      add constraint repair_vehicle_exclusions_mode_check
      check (mode in ('hide', 'show'));
  end if;
end $$;

comment on column public.repair_vehicle_exclusions.mode is
  'hide = not bookable in this scope; show = per-model override that re-enables a node hidden for all vehicles (make_name = model_name = ''*'').';
