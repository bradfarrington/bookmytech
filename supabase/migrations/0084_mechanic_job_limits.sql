-- ---------------------------------------------------------------------------
-- 0084 — Rate limits for the mechanic app's job screen (Task 67)
--
-- Two new families, seeded like 0081 and 0082. Code defaults in
-- lib/rate-limit/limiter.ts are identical, so the endpoints are limited even
-- before this runs; the rows are what let an admin tune them.
--
--   mechanicchecklist  POST /api/mobile/v1/mechanic/bookings/[id]/checklist —
--                      one request per answer, and a checklist is 46–173
--                      items. `mechanic`'s 15 a minute would refuse an honest
--                      run of passes within seconds.
--   mechanicupload     POST …/mechanic/bookings/[id]/photos — the customers'
--                      `upload` family is sized for six dispute photos; a
--                      mechanic photographs every job.
--
-- No schema change: rows in `platform_settings` only. Neither app needs to
-- regenerate types for this one.
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

insert into public.platform_settings (key, value) values
  ('mobile_mechanicchecklist_user_burst', '150'::jsonb),    -- per user, per 60s
  ('mobile_mechanicchecklist_user_daily', '4000'::jsonb),   -- per user, per 24h
  ('mobile_mechanicchecklist_ip_burst',   '300'::jsonb),    -- per IP,   per 60s
  ('mobile_mechanicchecklist_ip_daily',   '12000'::jsonb),  -- per IP,   per 24h
  ('mobile_mechanicupload_user_burst',    '20'::jsonb),
  ('mobile_mechanicupload_user_daily',    '300'::jsonb),
  ('mobile_mechanicupload_ip_burst',      '40'::jsonb),
  ('mobile_mechanicupload_ip_daily',      '900'::jsonb)
on conflict (key) do nothing;
