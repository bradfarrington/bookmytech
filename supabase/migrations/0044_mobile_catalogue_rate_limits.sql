-- ---------------------------------------------------------------------------
-- Rate limits for the HaynesPro-backed mobile endpoints (Task 18 Stage 2):
--   GET  /api/mobile/v1/repairs/tree
--   GET  /api/mobile/v1/repairs/search
--   POST /api/mobile/v1/quote
--
-- DATA ONLY — no schema change. This inserts rows into platform_settings; it
-- adds no table, column or type, so nothing here affects the TypeScript types
-- the mobile app generates from the schema.
--
-- Same mechanism and reasoning as the mobile_lookup_* limits in 0043: values
-- live in platform_settings so they are tunable in the database with no
-- redeploy, and lib/rate-limit/limiter.ts falls back to identical defaults in
-- code, so the endpoints are still limited if this seed hasn't been applied.
--
-- Why these are looser than /vehicle/lookup: drilling through the repair tree
-- is several requests in a row during normal use, and almost all of them are
-- served from the in-process memo in lib/haynespro/tree.ts, costing HaynesPro
-- nothing. A 10/minute lookup-style limit would refuse ordinary browsing.
--
-- Why search is tighter than the rest: HaynesPro has no keyword search, so the
-- CRM walks the tree to answer one — up to SEARCH_MAX_EXPANSIONS group reads
-- (lib/haynespro/catalogue.ts) where a browse costs one. Search spends the
-- catalogue buckets AND its own on every query.
--
-- mobile_catalogue_global_daily is the ceiling for the whole catalogue, search
-- included: it caps what a distributed attack can bill us against the metered
-- HaynesPro credentials in 24 hours.
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value) values
  ('mobile_catalogue_ip_burst',     '60'::jsonb),     -- per IP,   per 60s
  ('mobile_catalogue_ip_daily',     '1500'::jsonb),   -- per IP,   per 24h
  ('mobile_catalogue_user_burst',   '40'::jsonb),     -- per user, per 60s
  ('mobile_catalogue_user_daily',   '600'::jsonb),    -- per user, per 24h
  ('mobile_catalogue_global_daily', '30000'::jsonb),  -- everyone, per 24h — the spend ceiling
  ('mobile_search_ip_burst',        '15'::jsonb),     -- per IP,   per 60s
  ('mobile_search_ip_daily',        '300'::jsonb),    -- per IP,   per 24h
  ('mobile_search_user_burst',      '10'::jsonb),     -- per user, per 60s
  ('mobile_search_user_daily',      '150'::jsonb)     -- per user, per 24h
on conflict (key) do nothing;
