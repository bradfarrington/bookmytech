-- 0068_copy_no_em_dashes.sql
--
-- Task 46 (Brad, 2026-09-15): no em dashes in user-visible copy. The app's own
-- strings were changed in code; these rows were seeded by earlier migrations
-- and are shown to people, so they get the same treatment.
--
-- DATA ONLY: no table, column, type or policy changes, so the customer app's
-- generated types are unaffected. Idempotent: each update only touches rows
-- that still contain an em dash, and an admin can still edit any of these
-- values afterwards.

-- Servicing summaries (seeded in 0060), shown on the homepage services section
-- and in the booking funnel:
--   "… oil and filter change — every six months …"
--   → "… oil and filter change, every six months …"
update public.catalogue_products
   set summary = replace(summary, ' — ', ', ')
 where summary like '%—%';

update public.catalogue_products
   set description = replace(description, ' — ', ', ')
 where description like '%—%';

-- Seeded parts (0021), still offered by the mechanic's on-site quote picker and
-- copied onto the customer's quote line when chosen:
--   "Front Brake Pads — Standard" → "Front Brake Pads (Standard)"
-- Only the single-dash seed shape is rewritten; `name` has no unique constraint
-- (only `sku` does), so the rename can't collide. Historical quote lines keep
-- the text they were created with.
update public.parts
   set name = replace(name, ' — ', ' (') || ')'
 where name like '% — %'
   and name not like '% — % — %';
