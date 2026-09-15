-- 0069_remove_lkq.sql
-- Task 43 — remove LKQ Euro Car Parts entirely (Gareth, 2026-09-15). Alliance
-- Automotive is the only parts supplier: it prices HaynesPro's TecDoc part
-- groups directly, so the part group → LKQ matching table has no purpose.
--
-- ⚠️ SCHEMA CHANGE — the mobile app generates its TypeScript types from the
-- live schema, so `npm run db:types` must be re-run there after this applies.
-- Both tables touched are admin-only; nothing customer-facing changes.
--
-- Idempotent: safe to re-run.

-- The admin's part group → LKQ component matches (0066). LKQ-only.
drop table if exists public.part_group_links;

-- A repair's chosen part can only be an Alliance Automotive part now (0067
-- also allowed 'lkq').
delete from public.repair_part_choices where supplier <> 'aag';
alter table public.repair_part_choices drop constraint if exists repair_part_choices_supplier_check;
alter table public.repair_part_choices
  add constraint repair_part_choices_supplier_check check (supplier = 'aag');

comment on table public.repair_part_choices is
  'Admin override of the default Alliance Automotive part for a repair''s part group on one HaynesPro car type (Tasks 45, 43). Identity only, never price.';

-- LKQ's cached catalogue replies, pricing session, health rows and credit
-- counter (Tasks 41, 42), all kept in platform_settings.
delete from public.platform_settings
where key like 'lkq:%'
   or key in ('lkq_ecp_session', 'lkq_ecp_health', 'lkq_ads_health', 'lkq_ads_usage');
