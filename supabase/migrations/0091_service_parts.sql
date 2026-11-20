-- 0091_service_parts.sql
-- Task 83 — NAPA parts on the services added by hand.
--
-- ⚠️ SCHEMA CHANGE — the mobile apps generate their TypeScript types from the
-- live schema, so `npm run db:types` must be re-run in both after this
-- applies. Neither app reads catalogue_products directly (admin-only RLS).
--
-- catalogue_products.part_genart_ids — the NAPA part types a service buys for
-- the customer's car (7 oil filter, 8 air filter, 424 pollen filter, 9 fuel
-- filter, 686 spark plugs: lib/catalogue/service-parts.ts). Each is priced
-- from NAPA for the exact car like a repair's parts and added on top of the
-- product's own price, which becomes the labour. Null or empty = no parts, so
-- every product prices exactly as before until the admin ticks some.
--
-- No data: ticking a service's parts and lowering its price to labour only
-- are one save in /admin/services, so a customer is never charged for the
-- filters twice.
--
-- Deploy order: either. Before this applies the site reads products without
-- the column (lib/catalogue/load-products.ts) and no service has parts.
--
-- Idempotent: safe to re-run.

alter table public.catalogue_products
  add column if not exists part_genart_ids integer[];

alter table public.catalogue_products
  drop constraint if exists catalogue_products_part_genart_ids_check;
alter table public.catalogue_products
  add constraint catalogue_products_part_genart_ids_check
  check (part_genart_ids is null or cardinality(part_genart_ids) <= 20);

comment on column public.catalogue_products.part_genart_ids is
  'NAPA part types (TecDoc genart ids) the service buys, priced per car on top of the product''s own price (Task 83). Null or empty = none.';
