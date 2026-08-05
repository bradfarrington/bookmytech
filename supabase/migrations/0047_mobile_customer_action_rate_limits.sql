-- ---------------------------------------------------------------------------
-- Rate limits for the authenticated mobile customer-action endpoints
-- (Task 18 Stage 5):
--
--   action   GET  /api/mobile/v1/bookings/:id/cancel-quote
--            POST /api/mobile/v1/bookings/:id/cancel
--            POST /api/mobile/v1/bookings/:id/reschedule
--            POST /api/mobile/v1/bookings/:id/reschedule-response
--            POST /api/mobile/v1/bookings/:id/review
--            POST /api/mobile/v1/bookings/:id/disputes
--            POST /api/mobile/v1/disputes/:id/withdraw
--            POST /api/mobile/v1/checkout/cancel
--   message  POST /api/mobile/v1/disputes/:id/messages
--   upload   POST /api/mobile/v1/disputes/photos
--
-- DATA ONLY — no schema change. This inserts rows into platform_settings; it
-- adds no table, column or type, so nothing here affects the TypeScript types
-- the mobile app generates from the schema.
--
-- Same mechanism and reasoning as 0043–0045: values live in platform_settings so
-- they are tunable in the database with no redeploy, and lib/rate-limit/limiter.ts
-- falls back to identical defaults in code, so the endpoints are still limited if
-- this seed hasn't been applied.
--
-- Every one of these requires a Bearer token, so the per-user bucket is the real
-- limit and the per-IP one is an abuse ceiling for a single attacker cycling
-- accounts. Per-IP stays generous because mobile carriers put many genuine
-- customers behind one CGNAT address.
--
-- THREE FAMILIES, because they are not the same kind of request:
--
--   action  — settles money, emails people, or changes a job a mechanic is
--             holding time for. A real customer does a handful of these across a
--             whole booking, so this is deliberately tight — but loose enough
--             that a mistyped cancellation reason and a retry never trips it.
--   message — a dispute thread is chatty by nature; a real argument is a dozen
--             messages back and forth. Much looser. It still writes a row and
--             emails the mechanic, which is why it isn't unlimited.
--   upload  — each photo puts up to 10 MB into the job-media bucket that we then
--             keep. The bucket, not CPU, is what's being protected, and a dispute
--             takes at most MAX_DISPUTE_PHOTOS (6) images.
-- ---------------------------------------------------------------------------
insert into public.platform_settings (key, value) values
  ('mobile_action_user_burst',  '8'::jsonb),     -- per user, per 60s
  ('mobile_action_user_daily',  '40'::jsonb),    -- per user, per 24h
  ('mobile_action_ip_burst',    '20'::jsonb),    -- per IP,   per 60s
  ('mobile_action_ip_daily',    '200'::jsonb),   -- per IP,   per 24h
  ('mobile_message_user_burst', '20'::jsonb),    -- per user, per 60s
  ('mobile_message_user_daily', '200'::jsonb),   -- per user, per 24h
  ('mobile_message_ip_burst',   '40'::jsonb),    -- per IP,   per 60s
  ('mobile_message_ip_daily',   '600'::jsonb),   -- per IP,   per 24h
  ('mobile_upload_user_burst',  '10'::jsonb),    -- per user, per 60s
  ('mobile_upload_user_daily',  '60'::jsonb),    -- per user, per 24h
  ('mobile_upload_ip_burst',    '20'::jsonb),    -- per IP,   per 60s
  ('mobile_upload_ip_daily',    '200'::jsonb)    -- per IP,   per 24h
on conflict (key) do nothing;
