-- 0071_part_group_set_prices.sql
-- Task 43 follow-up — a set price for a part group Alliance Automotive can't price.
--
-- ⚠️ SCHEMA CHANGE — the mobile app generates its TypeScript types from the
-- live schema, so `npm run db:types` must be re-run there after this applies.
-- The table is admin-only; nothing customer-readable changes.
--
-- Consumables such as antifreeze, screenwash or oil may not come back on an
-- AAG quote for a registration. A charged part group AAG can't price stops the
-- booking (owner decision, 2026-09-15). With a set price here, the repair is
-- priced with that figure instead. AAG's own price always wins when there is
-- one, including its last known price from the past 7 days.
--
-- Idempotent: safe to re-run.

alter table public.part_group_settings
  add column if not exists set_price_pence integer
    check (set_price_pence is null or set_price_pence >= 0);

comment on column public.part_group_settings.set_price_pence is
  'What customers pay for this part group when Alliance Automotive has no price for it (Task 43). Null: no set price, so the repair cannot be booked without an AAG price.';
